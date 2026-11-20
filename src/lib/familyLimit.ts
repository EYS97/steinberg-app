import type { Timestamp } from 'firebase/firestore';
import type {
  AppEvent,
  Booking,
  EventMealConfig,
  Family,
  MealRequestStatus,
  SeudahRegistration,
  SeudahType,
} from '@/types';

// ── Guest-family limit — shared business logic ────────────────────────────
// Single source of truth for "which family counts toward the hosting limit",
// "how many complete families are approved for a meal" and "should a new
// request be auto-approved or wait for admin approval". Used by the Seudot
// registration flow, cancellation/promotion, the host limit panel, the admin
// requests screen and the tests — never duplicate these rules in components.
//
// The family model stores member *counts* (adults/kids), not member ids, so a
// "complete family with children" is expressed in counts: at least one parent
// attending and at least as many kids attending as the family record has.

/** Default max complete guest families with children, per meal. */
export const DEFAULT_MAX_GUEST_FAMILIES = 2;
export const MIN_GUEST_FAMILIES_LIMIT = 0;
export const MAX_GUEST_FAMILIES_LIMIT = 20;

/**
 * The limit mechanism applies only to Shabbat/holiday events from this date on
 * (per rollout decision: first gated Shabbat is Aug 7-8 2026). Every earlier
 * event — including all historical data — keeps the original instant-approval
 * behavior untouched.
 */
export const FAMILY_LIMIT_START = new Date(2026, 7, 2); // 2026-08-02 local

/** Does the guest-family limit mechanism apply to this event at all? */
export function limitAppliesToEvent(
  event: Pick<AppEvent, 'type' | 'date'> | undefined | null,
  start: Date = FAMILY_LIMIT_START
): boolean {
  if (!event) return false;
  if (event.type !== 'shabbat' && event.type !== 'holiday') return false;
  const d = event.date?.toDate?.();
  if (!d) return false;
  return d.getTime() >= start.getTime();
}

/** Clamp a configured limit into the allowed range. */
export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_GUEST_FAMILIES;
  return Math.min(MAX_GUEST_FAMILIES_LIMIT, Math.max(MIN_GUEST_FAMILIES_LIMIT, Math.round(value)));
}

/**
 * The effective limit for a seudah type. An event without a config doc — or a
 * config without this seudah type — behaves as though its limit is the default
 * (2). Safe runtime fallback; old events are never migrated.
 */
export function effectiveLimit(
  config: EventMealConfig | undefined | null,
  seudahType: SeudahType | string
): number {
  const raw = config?.limits?.[seudahType as SeudahType];
  if (typeof raw !== 'number') return DEFAULT_MAX_GUEST_FAMILIES;
  return clampLimit(raw);
}

/** Legacy registrations (no status field) are approved. */
export function effectiveStatus(
  reg: Pick<SeudahRegistration, 'status'> | undefined | null
): MealRequestStatus {
  return reg?.status ?? 'approved';
}

export function isApprovedReg(reg: Pick<SeudahRegistration, 'status'>): boolean {
  return effectiveStatus(reg) === 'approved';
}

export function isPendingReg(reg: Pick<SeudahRegistration, 'status'>): boolean {
  return effectiveStatus(reg) === 'pendingAdminApproval';
}

// ── Counted family ────────────────────────────────────────────────────────

export interface CountedFamilyInput {
  /** The nuclear family record; undefined for external guests etc. */
  family: Pick<Family, 'id' | 'kids'> | undefined | null;
  /** Adults from that family attending the meal. */
  attendingAdults: number;
  /** Kids from that family attending the meal. */
  attendingKids: number;
  /** The event's hosting family (null/'' ⇒ the household hosts). */
  hostFamilyId?: string | null;
}

/**
 * Does this attendance qualify as one complete guest family with children?
 *  - one nuclear family (a known family record — external guests never count)
 *  - it has children
 *  - at least one parent attending
 *  - all of its children attending (attendingKids >= family.kids)
 *  - not the host family
 * Couples without children, individuals, partial families and the host family
 * never count toward the limit (they still count for all regular attendance).
 */
export function isCountedGuestFamily({
  family,
  attendingAdults,
  attendingKids,
  hostFamilyId,
}: CountedFamilyInput): boolean {
  if (!family || !family.id) return false;
  if (hostFamilyId && family.id === hostFamilyId) return false;
  const familyKids = family.kids || 0;
  if (familyKids === 0) return false;
  if ((attendingAdults || 0) < 1) return false;
  return (attendingKids || 0) >= familyKids;
}

/** Counted-family check for a seudah registration. */
export function regIsCountedFamily(
  reg: Pick<SeudahRegistration, 'familyId' | 'adults' | 'kids'>,
  familiesById: Map<string, Family>,
  hostFamilyId?: string | null
): boolean {
  return isCountedGuestFamily({
    family: familiesById.get(reg.familyId),
    attendingAdults: reg.adults || 0,
    attendingKids: reg.kids || 0,
    hostFamilyId,
  });
}

/** Counted-family check for a room booking that joined the meal. */
export function bookingIsCountedFamily(
  booking: Pick<Booking, 'familyId' | 'adults' | 'kids' | 'isExternalGuest'>,
  familiesById: Map<string, Family>,
  hostFamilyId?: string | null
): boolean {
  if (booking.isExternalGuest) return false;
  return isCountedGuestFamily({
    family: familiesById.get(booking.familyId),
    attendingAdults: booking.adults || 0,
    attendingKids: booking.kids || 0,
    hostFamilyId,
  });
}

// ── Approved family count ─────────────────────────────────────────────────

export interface ApprovedCountInput {
  /** Registrations of THIS seudah only. */
  mealRegs: SeudahRegistration[];
  /** Room bookings participating in THIS seudah (already meal-filtered). */
  mealBookings?: Booking[];
  familiesById: Map<string, Family>;
  hostFamilyId?: string | null;
}

/**
 * Number of complete guest families with children approved for one meal.
 * Host-invited and admin-approved families count; pending/rejected/cancelled
 * never count. Room-booking families (sleepover guests invited to the house)
 * count as approved capacity too. Each nuclear family counts at most once per
 * meal, even with duplicate historical records.
 */
export function countApprovedGuestFamilies({
  mealRegs,
  mealBookings = [],
  familiesById,
  hostFamilyId,
}: ApprovedCountInput): number {
  const counted = new Set<string>();
  for (const reg of mealRegs) {
    if (!isApprovedReg(reg)) continue;
    if (regIsCountedFamily(reg, familiesById, hostFamilyId)) counted.add(reg.familyId);
  }
  for (const b of mealBookings) {
    if (bookingIsCountedFamily(b, familiesById, hostFamilyId)) counted.add(b.familyId);
  }
  return counted.size;
}

// ── Request evaluation ────────────────────────────────────────────────────

export interface EvaluateRequestInput {
  event: Pick<AppEvent, 'type' | 'date'> | undefined | null;
  config: EventMealConfig | undefined | null;
  seudahType: SeudahType | string;
  /** The requesting family's record. */
  family: Pick<Family, 'id' | 'kids'> | undefined | null;
  attendingAdults: number;
  attendingKids: number;
  /** Current approved complete-family count for this meal. */
  approvedCount: number;
}

/**
 * Status a newly submitted request should receive. Non-counted attendance
 * (couples without children, individuals, partial families, host family) and
 * pre-rollout events are always approved instantly — exactly the existing
 * behavior. A counted family is approved while capacity remains, otherwise it
 * waits for admin approval (never rejected, never blocked).
 */
export function evaluateNewRequest(input: EvaluateRequestInput): MealRequestStatus {
  const { event, config, seudahType, family, attendingAdults, attendingKids, approvedCount } = input;
  if (!limitAppliesToEvent(event)) return 'approved';
  const counted = isCountedGuestFamily({
    family,
    attendingAdults,
    attendingKids,
    hostFamilyId: config?.hostFamilyId,
  });
  if (!counted) return 'approved';
  return approvedCount < effectiveLimit(config, seudahType) ? 'approved' : 'pendingAdminApproval';
}

// ── FIFO promotion planning ───────────────────────────────────────────────

function queueMillis(reg: SeudahRegistration): number {
  const ts: Timestamp | undefined = reg.requestedAt ?? reg.createdAt;
  return ts?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
}

/** Oldest request first (requestedAt asc, createdAt fallback). */
export function sortPendingFifo(regs: SeudahRegistration[]): SeudahRegistration[] {
  return [...regs].sort((a, b) => queueMillis(a) - queueMillis(b));
}

export interface PromotionPlanInput {
  config: EventMealConfig | undefined | null;
  seudahType: SeudahType | string;
  /** ALL registrations of this seudah (any status). */
  mealRegs: SeudahRegistration[];
  mealBookings?: Booking[];
  familiesById: Map<string, Family>;
}

/**
 * Which pending requests should now be approved automatically (FIFO), given
 * current capacity. Used after a cancellation, after a limit increase, and
 * after any composition change. Pending requests that no longer qualify as a
 * counted family are also promoted (they never needed a place to begin with).
 * Existing approvals are NEVER revoked — a limit decrease returns an empty plan.
 */
export function planPromotions({
  config,
  seudahType,
  mealRegs,
  mealBookings = [],
  familiesById,
}: PromotionPlanInput): SeudahRegistration[] {
  const hostFamilyId = config?.hostFamilyId;
  const pending = sortPendingFifo(mealRegs.filter(isPendingReg));
  if (pending.length === 0) return [];

  const limit = effectiveLimit(config, seudahType);
  let approved = countApprovedGuestFamilies({ mealRegs, mealBookings, familiesById, hostFamilyId });

  const toPromote: SeudahRegistration[] = [];
  const promotedFamilies = new Set<string>();
  for (const reg of pending) {
    if (promotedFamilies.has(reg.familyId)) continue; // one place per nuclear family
    const counted = regIsCountedFamily(reg, familiesById, hostFamilyId);
    if (!counted) {
      // No longer a complete family (or became the host family) — doesn't need a place.
      toPromote.push(reg);
      continue;
    }
    if (approved < limit) {
      toPromote.push(reg);
      promotedFamilies.add(reg.familyId);
      approved++;
    }
  }
  return toPromote;
}

/** Deterministic doc id — enforces one request per family per meal. */
export function registrationDocId(seudahId: string, familyId: string): string {
  return `${seudahId}__${familyId}`.replace(/\//g, '_');
}
