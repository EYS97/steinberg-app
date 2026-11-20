import { HDate, months, formatHebrewYear, formatHebrewDateParts, formatGregorianDate, parseHebrewDateParts } from './dates';
import type { CalendarType, HebrewDateParts } from './dates';
import { indexPersons } from './familyTree/adapter';
import type { TreePerson } from '@/types';
import type { AnnualEntry } from './familyEvents';

// ── Family lifecycle events (מחזור חיים משפחתי) ───────────────────────────
// A lifecycle event is a *data record* describing a family transition — the
// first supported type is a wedding that brings a new member into the family.
// Everything downstream (onboarding eligibility, the wizard's copy, welcome
// cards, anniversaries) derives from these records plus the existing
// `familyTree` collection. No person is ever named in code: the next wedding
// is a new Firestore doc in `familyLifecycle`, not a source change.
//
// Completion is stored per user on their own `userActivity` doc (the same
// user-writable doc that remembers the August family pick), keyed by
// `<onboardingId>:<lifecycleId>` — so completion is per-member, per-record,
// and versioned (a future wedding_v2 is a distinct key by design).

export type LifecycleType = 'wedding';

/** Versioned onboarding id per lifecycle type. Bump to re-offer a revised flow. */
export const ONBOARDING_IDS: Record<LifecycleType, string> = {
  wedding: 'wedding_v1',
};

export const LIFECYCLE_COLLECTION = 'familyLifecycle';

/** Firestore Timestamp / Date / ISO string / millis — anything time-like. */
export type TimeLike =
  | Date
  | string
  | number
  | { toDate: () => Date }
  | null
  | undefined;

export function toDateSafe(t: TimeLike): Date | null {
  if (!t && t !== 0) return null;
  if (t instanceof Date) return t;
  if (typeof t === 'object' && typeof t.toDate === 'function') {
    try { return t.toDate(); } catch { return null; }
  }
  if (typeof t === 'string' || typeof t === 'number') {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export interface LifecycleEvent {
  id: string;
  type: LifecycleType;
  /** Versioned onboarding this record offers (defaults per type). */
  onboardingId?: string;
  /** familyTree doc id of the NEW family member (the onboarding subject). */
  memberPersonId: string;
  /** familyTree doc id of the spouse already in the family. */
  spousePersonId?: string;
  /** Auth emails allowed to run this onboarding (the new member's accounts). */
  memberEmails?: string[];
  /** Wedding date — Gregorian "YYYY-MM-DD". */
  weddingDate?: string;
  /** Structured Hebrew wedding date (authoritative when calendarType='hebrew'). */
  hebrewDate?: HebrewDateParts | null;
  /** Which calendar drives the annual anniversary (default hebrew). */
  calendarType?: CalendarType;
  createdAt?: TimeLike;
  createdBy?: string;
}

export function onboardingIdOf(ev: LifecycleEvent): string {
  return ev.onboardingId || ONBOARDING_IDS[ev.type] || `${ev.type}_v1`;
}

/** The per-user completion key for a lifecycle record's onboarding. */
export function completionKey(ev: LifecycleEvent): string {
  return `${onboardingIdOf(ev)}:${ev.id}`;
}

/** Per-user onboarding state, stored under userActivity.onboardings[key]. */
export interface OnboardingState {
  completedAt?: TimeLike;
  welcomeCardDismissedAt?: TimeLike;
}

export type OnboardingStates = Record<string, OnboardingState>;

// ── Eligibility ───────────────────────────────────────────────────────────

function normEmail(e: string | null | undefined): string {
  return (e || '').trim().toLowerCase();
}

export function isCompleted(ev: LifecycleEvent, states: OnboardingStates): boolean {
  return !!toDateSafe(states[completionKey(ev)]?.completedAt);
}

/** Does this lifecycle record target the signed-in user? Pure email match. */
export function matchesUser(ev: LifecycleEvent, userEmail: string | null | undefined): boolean {
  const email = normEmail(userEmail);
  if (!email) return false;
  return (ev.memberEmails || []).some(e => normEmail(e) === email);
}

/**
 * The lifecycle record whose onboarding the current user should see:
 * targets the user's email AND its versioned onboarding was never completed.
 * Members with no matching record (i.e. everyone else) get null.
 */
export function resolveEligibleOnboarding(
  userEmail: string | null | undefined,
  events: LifecycleEvent[],
  states: OnboardingStates
): LifecycleEvent | null {
  const mine = events
    .filter(ev => matchesUser(ev, userEmail) && !isCompleted(ev, states))
    .sort((a, b) => (toDateSafe(a.createdAt)?.getTime() ?? 0) - (toDateSafe(b.createdAt)?.getTime() ?? 0));
  return mine[0] ?? null;
}

// ── Onboarding context (all display data, derived — never hardcoded) ──────

/** Preferred short/display name: nickname, else first token of the Hebrew name. */
export function personFirstName(p: TreePerson | null | undefined): string {
  if (!p) return '';
  const nick = (p.nickname || '').trim();
  if (nick) return nick;
  const name = (p.nameHe || p.nameLatin || '').trim();
  return name.split(/\s+/)[0] || '';
}

export interface OnboardingContext {
  lifecycle: LifecycleEvent;
  member: TreePerson | null;
  spouse: TreePerson | null;
  memberFirstName: string;
  spouseFirstName: string;
  /** 'f' | 'm' | undefined — drives gendered Hebrew copy. */
  memberGender?: 'm' | 'f';
  /** Formatted wedding date per the record's calendar ('' when unknown). */
  weddingDateLabel: string;
  /** True when the record carries a usable wedding date. */
  hasWeddingDate: boolean;
  /** The spouse's parents (the member's new parents-in-law). */
  spouseParents: TreePerson[];
  /** The spouse's siblings, closest family circle (excludes the spouse). */
  spouseSiblings: TreePerson[];
  /** Spouses of those siblings that exist in the tree. */
  siblingSpouses: TreePerson[];
}

export function weddingDateLabel(ev: LifecycleEvent): string {
  const hebrew = parseHebrewDateParts(ev.hebrewDate);
  if ((ev.calendarType ?? 'hebrew') === 'hebrew' && hebrew) return formatHebrewDateParts(hebrew);
  if (ev.weddingDate) {
    const d = new Date(`${ev.weddingDate}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return formatGregorianDate(d, 'long');
  }
  return hebrew ? formatHebrewDateParts(hebrew) : '';
}

export function hasWeddingDate(ev: LifecycleEvent): boolean {
  return !!(ev.weddingDate || parseHebrewDateParts(ev.hebrewDate));
}

export function buildOnboardingContext(
  ev: LifecycleEvent,
  persons: TreePerson[]
): OnboardingContext {
  const idx = indexPersons(persons);
  const member = idx.byId.get(ev.memberPersonId) ?? null;
  // Prefer the explicit record; fall back to the tree's own spouse link.
  const spouseId = ev.spousePersonId || (member ? idx.spouseOf.get(member.id) : undefined);
  const spouse = (spouseId && idx.byId.get(spouseId)) || null;

  const spouseParents = spouse
    ? ([spouse.fatherId, spouse.motherId]
        .map(pid => (pid ? idx.byId.get(pid) : undefined))
        .filter(Boolean) as TreePerson[])
    : [];

  const spouseSiblings = spouse
    ? persons
        .filter(p =>
          p.id !== spouse.id &&
          p.id !== ev.memberPersonId &&
          ((p.fatherId && p.fatherId === spouse.fatherId) ||
            (p.motherId && p.motherId === spouse.motherId))
        )
        .sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999))
    : [];

  const siblingSpouses = spouseSiblings
    .map(s => idx.spouseOf.get(s.id))
    .map(id => (id ? idx.byId.get(id) : undefined))
    .filter((p): p is TreePerson => !!p && p.id !== ev.memberPersonId);

  return {
    lifecycle: ev,
    member,
    spouse,
    memberFirstName: personFirstName(member),
    spouseFirstName: personFirstName(spouse),
    memberGender: member?.gender,
    weddingDateLabel: weddingDateLabel(ev),
    hasWeddingDate: hasWeddingDate(ev),
    spouseParents,
    spouseSiblings,
    siblingSpouses,
  };
}

/** Couple display, existing family member first — e.g. "{spouse} ו{member}". */
export function coupleLabel(ctx: Pick<OnboardingContext, 'memberFirstName' | 'spouseFirstName'>): string {
  const a = ctx.spouseFirstName;
  const b = ctx.memberFirstName;
  if (a && b) return `${a} ו${b}`;
  return a || b;
}

// ── Anniversaries (derived — never written, so never duplicated) ──────────

/**
 * Map wedding lifecycle records to Family-Events-Hub annual entries. Records
 * without a wedding date are skipped. Each couple yields exactly one entry,
 * independent of every other couple.
 */
export function lifecycleAnniversaryEntries(
  events: LifecycleEvent[],
  persons: TreePerson[]
): AnnualEntry[] {
  return events
    .filter(ev => ev.type === 'wedding' && hasWeddingDate(ev))
    .map(ev => {
      const ctx = buildOnboardingContext(ev, persons);
      const name = coupleLabel(ctx);
      if (!name) return null;
      return {
        id: ev.id,
        name,
        date: ev.weddingDate,
        hebrewDate: ev.hebrewDate ?? undefined,
        calendarType: ev.calendarType ?? (parseHebrewDateParts(ev.hebrewDate) ? 'hebrew' : 'gregorian'),
      } as AnnualEntry;
    })
    .filter((e): e is AnnualEntry => !!e);
}

// ── Post-onboarding welcome card ──────────────────────────────────────────

export const WELCOME_CARD_DAYS = 14;

/** Show the temporary "welcome to the family" home card? */
export function shouldShowWelcomeCard(
  ev: LifecycleEvent,
  states: OnboardingStates,
  now: Date,
  windowDays: number = WELCOME_CARD_DAYS
): boolean {
  const state = states[completionKey(ev)];
  const completed = toDateSafe(state?.completedAt);
  if (!completed) return false;
  if (toDateSafe(state?.welcomeCardDismissedAt)) return false;
  const ageMs = now.getTime() - completed.getTime();
  return ageMs >= 0 && ageMs < windowDays * 86_400_000;
}

// ── Seasonal "first Rosh Hashanah with the family" moment ─────────────────

export interface SeasonalRoshHashanah {
  /** The Hebrew year the upcoming/current Rosh Hashanah begins, e.g. 5787. */
  hebrewYear: number;
  /** Formatted, e.g. ה׳תשפ״ז. */
  hebrewYearLabel: string;
}

/**
 * The member's FIRST Rosh Hashanah since joining, shown only inside a
 * derived window (15 Elul before it → end of Tishrei after it). Everything is
 * computed from the record + the Hebrew calendar: no names, no Gregorian
 * dates, no year literals — next year it extinguishes itself.
 */
export function seasonalFirstRoshHashanah(
  ev: LifecycleEvent,
  states: OnboardingStates,
  now: Date
): SeasonalRoshHashanah | null {
  const state = states[completionKey(ev)];
  const joined = toDateSafe(state?.completedAt) ?? toDateSafe(ev.createdAt);
  if (!joined) return null;
  const firstRHYear = new HDate(joined).getFullYear() + 1;
  const windowStart = new HDate(15, months.ELUL, firstRHYear - 1).greg();
  const windowEnd = new HDate(30, months.TISHREI, firstRHYear).greg();
  windowEnd.setHours(23, 59, 59, 999);
  if (now < windowStart || now > windowEnd) return null;
  return { hebrewYear: firstRHYear, hebrewYearLabel: formatHebrewYear(firstRHYear) };
}
