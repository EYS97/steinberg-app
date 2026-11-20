import { describe, it, expect } from 'vitest';
import {
  resolveEligibleOnboarding,
  matchesUser,
  isCompleted,
  completionKey,
  onboardingIdOf,
  buildOnboardingContext,
  coupleLabel,
  personFirstName,
  lifecycleAnniversaryEntries,
  shouldShowWelcomeCard,
  seasonalFirstRoshHashanah,
  hasWeddingDate,
  weddingDateLabel,
  type LifecycleEvent,
  type OnboardingStates,
} from './lifecycle';
import { buildFromSources } from './familyEvents';
import { months, HDate } from './dates';
import type { TreePerson } from '@/types';

// ── Fixtures ──────────────────────────────────────────────────────────────
// Two independent couples. The first mirrors the real production case; the
// second is a synthetic FUTURE wedding with entirely different names, proving
// the same code paths work with no source change.

const p = (o: Partial<TreePerson> & { id: string }): TreePerson => o as TreePerson;

// Couple A — current production case (Noa married into the family via Israel)
const A_MEMBER = 'a-noa';
const A_SPOUSE = 'a-israel';
// Couple B — synthetic future wedding (a son of the family marries Tamar)
const B_MEMBER = 'b-tamar';
const B_SPOUSE = 'b-david';

const PERSONS: TreePerson[] = [
  // Shared parents of both in-family spouses
  p({ id: 'dad', nameHe: 'משה מיכאל שטיינברג', gender: 'm', birthYear: 1973, spouseId: 'mom' }),
  p({ id: 'mom', nameHe: 'מרים שטיינברג', gender: 'f', birthYear: 1972, spouseId: 'dad' }),

  // Couple A
  p({ id: A_SPOUSE, nameHe: 'ישראל שלום שטיינברג', gender: 'm', birthYear: 2005, fatherId: 'dad', motherId: 'mom', spouseId: A_MEMBER }),
  p({ id: A_MEMBER, nameHe: 'נעה שטיינברג', gender: 'f', spouseId: A_SPOUSE, photoData: null }),

  // Couple B (synthetic future wedding)
  p({ id: B_SPOUSE, nameHe: 'דוד שטיינברג', nickname: 'דודי', gender: 'm', birthYear: 2003, fatherId: 'dad', motherId: 'mom', spouseId: B_MEMBER }),
  p({ id: B_MEMBER, nameHe: 'תמר לוי', gender: 'f', birthYear: 2004, spouseId: B_SPOUSE, photoData: 'data:image/jpeg;base64,xxx' }),

  // Another sibling + their spouse (family-preview content)
  p({ id: 'sis', nameHe: 'טובה ליכטנשטיין', gender: 'f', birthYear: 2004, fatherId: 'dad', motherId: 'mom', spouseId: 'sis-h' }),
  p({ id: 'sis-h', nameHe: 'יחיאל ליכטנשטיין', gender: 'm', birthYear: 2000, spouseId: 'sis' }),

  // An unrelated existing member who must never be swept into onboarding
  p({ id: 'gran', nameHe: 'סופיה שטיינברג', gender: 'f', birthYear: 1944 }),
];

const weddingA: LifecycleEvent = {
  id: 'lc-a',
  type: 'wedding',
  memberPersonId: A_MEMBER,
  spousePersonId: A_SPOUSE,
  memberEmails: ['noa@example.com'],
  hebrewDate: { day: 10, month: months.ELUL, year: 5786 },
  calendarType: 'hebrew',
  createdAt: new Date('2026-09-01T09:00:00Z'),
};

const weddingB: LifecycleEvent = {
  id: 'lc-b',
  type: 'wedding',
  memberPersonId: B_MEMBER,
  spousePersonId: B_SPOUSE,
  memberEmails: ['Tamar@Example.com'],
  weddingDate: '2027-03-14',
  calendarType: 'gregorian',
  createdAt: new Date('2027-03-20T09:00:00Z'),
};

const EVENTS = [weddingA, weddingB];
const NONE: OnboardingStates = {};

describe('onboarding identity & versioning', () => {
  it('derives a versioned onboarding id per lifecycle type', () => {
    expect(onboardingIdOf(weddingA)).toBe('wedding_v1');
    expect(onboardingIdOf({ ...weddingA, onboardingId: 'wedding_v2' })).toBe('wedding_v2');
  });

  it('scopes the completion key to both the version and the record', () => {
    expect(completionKey(weddingA)).toBe('wedding_v1:lc-a');
    expect(completionKey(weddingB)).toBe('wedding_v1:lc-b');
    expect(completionKey(weddingA)).not.toBe(completionKey(weddingB));
    // A future onboarding version is a distinct key — never auto-completed.
    expect(completionKey({ ...weddingA, onboardingId: 'wedding_v2' })).toBe('wedding_v2:lc-a');
  });
});

describe('eligibility', () => {
  it('matches the targeted member by email, case- and space-insensitively', () => {
    expect(matchesUser(weddingA, 'noa@example.com')).toBe(true);
    expect(matchesUser(weddingA, '  NOA@Example.com ')).toBe(true);
    expect(matchesUser(weddingB, 'tamar@example.com')).toBe(true);
  });

  it('does not match other people, empty or missing emails', () => {
    expect(matchesUser(weddingA, 'tamar@example.com')).toBe(false);
    expect(matchesUser(weddingA, '')).toBe(false);
    expect(matchesUser(weddingA, null)).toBe(false);
    expect(matchesUser({ ...weddingA, memberEmails: undefined }, 'noa@example.com')).toBe(false);
  });

  it('offers the onboarding to the eligible member', () => {
    expect(resolveEligibleOnboarding('noa@example.com', EVENTS, NONE)?.id).toBe('lc-a');
    expect(resolveEligibleOnboarding('tamar@example.com', EVENTS, NONE)?.id).toBe('lc-b');
  });

  it('never offers it to existing members without a lifecycle record', () => {
    for (const email of ['dad@example.com', 'gran@example.com', 'someone@else.org']) {
      expect(resolveEligibleOnboarding(email, EVENTS, NONE)).toBeNull();
    }
  });

  it('stops offering it once completed, and does not replay', () => {
    const states: OnboardingStates = { 'wedding_v1:lc-a': { completedAt: new Date('2026-09-09') } };
    expect(isCompleted(weddingA, states)).toBe(true);
    expect(resolveEligibleOnboarding('noa@example.com', EVENTS, states)).toBeNull();
  });

  it('keeps each couple’s completion state independent', () => {
    const states: OnboardingStates = { 'wedding_v1:lc-a': { completedAt: new Date('2026-09-09') } };
    // A is done; B is untouched and still eligible.
    expect(resolveEligibleOnboarding('noa@example.com', EVENTS, states)).toBeNull();
    expect(resolveEligibleOnboarding('tamar@example.com', EVENTS, states)?.id).toBe('lc-b');
    expect(isCompleted(weddingB, states)).toBe(false);
  });

  it('treats a bumped onboarding version as not completed', () => {
    const states: OnboardingStates = { 'wedding_v1:lc-a': { completedAt: new Date('2026-09-09') } };
    const v2 = { ...weddingA, onboardingId: 'wedding_v2' };
    expect(isCompleted(v2, states)).toBe(false);
    expect(resolveEligibleOnboarding('noa@example.com', [v2], states)?.id).toBe('lc-a');
  });
});

describe('onboarding context is derived from data', () => {
  it('builds the current couple’s context from the family tree', () => {
    const ctx = buildOnboardingContext(weddingA, PERSONS);
    expect(ctx.memberFirstName).toBe('נעה');
    expect(ctx.spouseFirstName).toBe('ישראל');
    expect(ctx.memberGender).toBe('f');
    expect(ctx.spouseParents.map(x => x.id).sort()).toEqual(['dad', 'mom']);
    // The member is never listed as their own new relative.
    expect(ctx.spouseSiblings.map(x => x.id)).not.toContain(A_MEMBER);
    expect(ctx.spouseSiblings.map(x => x.id)).toContain('sis');
    expect(ctx.siblingSpouses.map(x => x.id)).toContain('sis-h');
  });

  it('builds the synthetic future couple’s context with the same code', () => {
    const ctx = buildOnboardingContext(weddingB, PERSONS);
    expect(ctx.memberFirstName).toBe('תמר');
    expect(ctx.spouseFirstName).toBe('דודי'); // nickname wins over the formal name
    expect(ctx.spouseParents.map(x => x.id).sort()).toEqual(['dad', 'mom']);
    // No content from the other couple leaks in.
    const names = [
      ctx.memberFirstName, ctx.spouseFirstName,
      ...ctx.spouseSiblings.map(s => s.nameHe ?? ''),
      ...ctx.spouseParents.map(s => s.nameHe ?? ''),
    ].join(' ');
    expect(names).not.toContain('נעה');
  });

  it('falls back to the tree spouse link when the record omits the spouse', () => {
    const ctx = buildOnboardingContext({ ...weddingA, spousePersonId: undefined }, PERSONS);
    expect(ctx.spouse?.id).toBe(A_SPOUSE);
    expect(ctx.spouseFirstName).toBe('ישראל');
  });

  it('degrades safely when the member is missing from the tree', () => {
    const ctx = buildOnboardingContext({ ...weddingA, memberPersonId: 'ghost' }, PERSONS);
    expect(ctx.member).toBeNull();
    expect(ctx.memberFirstName).toBe('');
    // The rest still resolves from the record's spouse — the UI gates on `member`.
    expect(ctx.spouse?.id).toBe(A_SPOUSE);
  });

  it('degrades safely when the spouse is unknown', () => {
    const lone: LifecycleEvent = { id: 'x', type: 'wedding', memberPersonId: 'gran' };
    const ctx = buildOnboardingContext(lone, PERSONS);
    expect(ctx.spouse).toBeNull();
    expect(ctx.spouseFirstName).toBe('');
    expect(ctx.spouseParents).toEqual([]);
    expect(ctx.spouseSiblings).toEqual([]);
    expect(ctx.siblingSpouses).toEqual([]);
  });

  it('prefers a nickname, else the first token of the Hebrew name', () => {
    expect(personFirstName(p({ id: 'x', nameHe: 'יעקב זאב שטיינברג', nickname: 'יאשקה' }))).toBe('יאשקה');
    expect(personFirstName(p({ id: 'x', nameHe: 'יעקב זאב שטיינברג' }))).toBe('יעקב');
    expect(personFirstName(null)).toBe('');
  });

  it('renders couple labels with the in-family spouse first', () => {
    expect(coupleLabel(buildOnboardingContext(weddingA, PERSONS))).toBe('ישראל ונעה');
    expect(coupleLabel(buildOnboardingContext(weddingB, PERSONS))).toBe('דודי ותמר');
  });
});

describe('wedding date', () => {
  it('reports and formats a Hebrew-anchored wedding date', () => {
    expect(hasWeddingDate(weddingA)).toBe(true);
    expect(weddingDateLabel(weddingA)).toContain('אלול');
  });

  it('reports and formats a Gregorian-anchored wedding date', () => {
    expect(hasWeddingDate(weddingB)).toBe(true);
    expect(weddingDateLabel(weddingB)).toContain('2027');
  });

  it('reports a missing wedding date without throwing', () => {
    const bare: LifecycleEvent = { id: 'x', type: 'wedding', memberPersonId: A_MEMBER };
    expect(hasWeddingDate(bare)).toBe(false);
    expect(weddingDateLabel(bare)).toBe('');
  });
});

describe('anniversaries are derived, never written', () => {
  it('produces exactly one entry per couple with a wedding date', () => {
    const entries = lifecycleAnniversaryEntries(EVENTS, PERSONS);
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.name).sort()).toEqual(['דודי ותמר', 'ישראל ונעה'].sort());
    expect(new Set(entries.map(e => e.id)).size).toBe(2);
  });

  it('is stable across repeated derivation (idempotent, no duplicates)', () => {
    const a = lifecycleAnniversaryEntries(EVENTS, PERSONS);
    const b = lifecycleAnniversaryEntries(EVENTS, PERSONS);
    expect(b).toEqual(a);
    // Re-running with the same records never accumulates entries.
    expect(lifecycleAnniversaryEntries([...EVENTS], PERSONS)).toHaveLength(2);
  });

  it('skips records without a wedding date', () => {
    const bare: LifecycleEvent = { id: 'x', type: 'wedding', memberPersonId: A_MEMBER, spousePersonId: A_SPOUSE };
    expect(lifecycleAnniversaryEntries([bare], PERSONS)).toHaveLength(0);
  });

  it('feeds the family-events hub as a Hebrew-recurring anniversary', () => {
    // 10 Elul 5787 falls in Sept 2027 — inside a 60-day window from 1 Aug 2027.
    const events = buildFromSources(
      [{ kind: 'anniversary', recur: 'birthday', withCount: true, items: lifecycleAnniversaryEntries([weddingA], PERSONS) }],
      { today: new Date(2027, 7, 1), horizonDays: 90 }
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('anniversary');
    expect(events[0].name).toBe('ישראל ונעה');
    expect(new HDate(events[0].date).getMonth()).toBe(months.ELUL);
    expect(events[0].count).toBe(1); // first anniversary
  });

  it('keeps couples independent in the hub feed', () => {
    const events = buildFromSources(
      [{ kind: 'anniversary', recur: 'birthday', withCount: true, items: lifecycleAnniversaryEntries(EVENTS, PERSONS) }],
      { today: new Date(2028, 1, 1), horizonDays: 120 }
    );
    // Only couple B's March anniversary falls in this window.
    expect(events.map(e => e.name)).toEqual(['דודי ותמר']);
  });
});

describe('welcome card lifetime', () => {
  const completedAt = new Date('2026-09-09T10:00:00Z');
  const states: OnboardingStates = { 'wedding_v1:lc-a': { completedAt } };

  it('does not show before completion', () => {
    expect(shouldShowWelcomeCard(weddingA, NONE, new Date('2026-09-09T12:00:00Z'))).toBe(false);
  });

  it('shows right after completion and inside the window', () => {
    expect(shouldShowWelcomeCard(weddingA, states, new Date('2026-09-09T12:00:00Z'))).toBe(true);
    expect(shouldShowWelcomeCard(weddingA, states, new Date('2026-09-22T09:00:00Z'))).toBe(true);
  });

  it('expires after the window and never returns', () => {
    expect(shouldShowWelcomeCard(weddingA, states, new Date('2026-09-24T10:00:00Z'))).toBe(false);
    expect(shouldShowWelcomeCard(weddingA, states, new Date('2027-09-24T10:00:00Z'))).toBe(false);
  });

  it('stays hidden once dismissed', () => {
    const dismissed: OnboardingStates = {
      'wedding_v1:lc-a': { completedAt, welcomeCardDismissedAt: new Date('2026-09-10T10:00:00Z') },
    };
    expect(shouldShowWelcomeCard(weddingA, dismissed, new Date('2026-09-11T10:00:00Z'))).toBe(false);
  });

  it('is scoped to the member who completed it', () => {
    // Couple B's card is driven by couple B's own key only.
    expect(shouldShowWelcomeCard(weddingB, states, new Date('2026-09-09T12:00:00Z'))).toBe(false);
  });
});

describe('seasonal first Rosh Hashanah', () => {
  const states: OnboardingStates = {
    'wedding_v1:lc-a': { completedAt: new Date('2026-09-09T10:00:00Z') }, // 26 Elul 5786
  };

  it('shows the correct upcoming Hebrew year in gematriya', () => {
    const s = seasonalFirstRoshHashanah(weddingA, states, new Date('2026-09-09T10:00:00Z'));
    expect(s?.hebrewYear).toBe(5787);
    expect(s?.hebrewYearLabel).toBe('ה׳תשפ״ז');
    // Never the outgoing year.
    expect(s?.hebrewYearLabel).not.toBe('ה׳תשפ״ו');
  });

  it('shows through Rosh Hashanah and the rest of Tishrei', () => {
    expect(seasonalFirstRoshHashanah(weddingA, states, new Date('2026-09-13T10:00:00Z'))).not.toBeNull();
    expect(seasonalFirstRoshHashanah(weddingA, states, new Date('2026-10-05T10:00:00Z'))).not.toBeNull();
  });

  it('does not show before the window opens', () => {
    expect(seasonalFirstRoshHashanah(weddingA, states, new Date('2026-08-01T10:00:00Z'))).toBeNull();
  });

  it('never reappears in later years with stale copy', () => {
    for (const when of ['2026-11-01', '2027-09-12', '2028-09-20']) {
      expect(seasonalFirstRoshHashanah(weddingA, states, new Date(`${when}T10:00:00Z`))).toBeNull();
    }
  });

  it('works for the synthetic couple on their own timeline', () => {
    const bStates: OnboardingStates = {
      'wedding_v1:lc-b': { completedAt: new Date('2027-03-21T10:00:00Z') }, // Adar 5787
    };
    // Their first Rosh Hashanah is 5788 — not shown in March…
    expect(seasonalFirstRoshHashanah(weddingB, bStates, new Date('2027-03-25T10:00:00Z'))).toBeNull();
    // 5787 is a leap year, so RH 5788 is 2 Oct 2027 and the window opens on
    // 15 Elul = 17 Sep 2027. The window follows the Hebrew calendar, not a
    // fixed Gregorian offset, so mid-September is still outside it.
    expect(seasonalFirstRoshHashanah(weddingB, bStates, new Date('2027-09-15T10:00:00Z'))).toBeNull();
    // …and shown in its own window, with its own year.
    const s = seasonalFirstRoshHashanah(weddingB, bStates, new Date('2027-09-20T10:00:00Z'));
    expect(s?.hebrewYear).toBe(5788);
    expect(s?.hebrewYearLabel).toBe('ה׳תשפ״ח');
  });

  it('falls back to the record creation time when completion is unknown', () => {
    expect(seasonalFirstRoshHashanah(weddingA, NONE, new Date('2026-09-09T10:00:00Z'))?.hebrewYear).toBe(5787);
  });
});
