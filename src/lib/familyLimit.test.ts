import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_GUEST_FAMILIES,
  FAMILY_LIMIT_START,
  clampLimit,
  limitAppliesToEvent,
  effectiveLimit,
  effectiveStatus,
  isCountedGuestFamily,
  regIsCountedFamily,
  bookingIsCountedFamily,
  countApprovedGuestFamilies,
  evaluateNewRequest,
  planPromotions,
  sortPendingFifo,
  registrationDocId,
} from './familyLimit';
import type {
  AppEvent,
  Booking,
  EventMealConfig,
  Family,
  SeudahRegistration,
} from '@/types';

// ── Helpers ─────────────────────────────────────────────────────────────────
function ts(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return { toDate: () => d, toMillis: () => d.getTime() } as AppEvent['date'];
}
/** Shabbat safely after the rollout start date. */
function gatedEvent(p: Partial<AppEvent> = {}): AppEvent {
  return { id: 'ev1', title: 'שבת', type: 'shabbat', date: ts('2026-09-04'), notes: '', ...p };
}
function family(p: Partial<Family> & Pick<Family, 'id'>): Family {
  return {
    husband: 'א', wife: 'ב', adults: 2, kids: 3,
    status: '', needs: '', whatsapp: '', email: '',
    ...p,
  };
}
function famMap(...fams: Family[]): Map<string, Family> {
  return new Map(fams.map(f => [f.id, f]));
}
function reg(p: Partial<SeudahRegistration> & Pick<SeudahRegistration, 'familyId'>): SeudahRegistration {
  return {
    id: `r-${p.familyId}-${Math.random()}`,
    seudahId: 's1', eventId: 'ev1', familyName: 'משפחה',
    adults: 2, kids: 3, diners: 5,
    ...p,
  };
}
function booking(p: Partial<Booking> & Pick<Booking, 'familyId'>): Booking {
  return {
    id: `bk-${Math.random()}`, roomId: 'penina', familyName: 'משפחה',
    eventId: 'ev1', eventTitle: '', adults: 2, kids: 2, notes: '',
    mealParticipation: [],
    ...p,
  };
}
const SEUDAH = 'סעודת שבת';
function config(limits: Record<string, number> = {}, hostFamilyId?: string | null): EventMealConfig {
  return { id: 'ev1', limits, hostFamilyId };
}

// ── isCountedGuestFamily ────────────────────────────────────────────────────
describe('isCountedGuestFamily', () => {
  const fam = family({ id: 'f1', adults: 2, kids: 3 });

  it('host family does not count', () => {
    expect(isCountedGuestFamily({ family: fam, attendingAdults: 2, attendingKids: 3, hostFamilyId: 'f1' })).toBe(false);
  });

  it('a couple without children does not count', () => {
    const couple = family({ id: 'f2', adults: 2, kids: 0 });
    expect(isCountedGuestFamily({ family: couple, attendingAdults: 2, attendingKids: 0 })).toBe(false);
  });

  it('an individual guest (no family record) does not count', () => {
    expect(isCountedGuestFamily({ family: undefined, attendingAdults: 1, attendingKids: 0 })).toBe(false);
  });

  it('one parent and all children count', () => {
    expect(isCountedGuestFamily({ family: fam, attendingAdults: 1, attendingKids: 3 })).toBe(true);
  });

  it('two parents and all children count', () => {
    expect(isCountedGuestFamily({ family: fam, attendingAdults: 2, attendingKids: 3 })).toBe(true);
  });

  it('one parent and all but one child do not count', () => {
    expect(isCountedGuestFamily({ family: fam, attendingAdults: 1, attendingKids: 2 })).toBe(false);
  });

  it('children without a parent do not count', () => {
    expect(isCountedGuestFamily({ family: fam, attendingAdults: 0, attendingKids: 3 })).toBe(false);
  });

  it('non-host family with children counts when host is another family', () => {
    expect(isCountedGuestFamily({ family: fam, attendingAdults: 2, attendingKids: 3, hostFamilyId: 'other' })).toBe(true);
  });
});

// ── effective limit / status fallbacks ──────────────────────────────────────
describe('effectiveLimit / effectiveStatus (backward compatibility)', () => {
  it('old event without config uses the default of 2', () => {
    expect(effectiveLimit(undefined, SEUDAH)).toBe(DEFAULT_MAX_GUEST_FAMILIES);
    expect(effectiveLimit(null, SEUDAH)).toBe(2);
    expect(effectiveLimit(config({}), SEUDAH)).toBe(2);
  });

  it('configured limit wins and is clamped to 0..20', () => {
    expect(effectiveLimit(config({ [SEUDAH]: 5 }), SEUDAH)).toBe(5);
    expect(effectiveLimit(config({ [SEUDAH]: 0 }), SEUDAH)).toBe(0);
    expect(effectiveLimit(config({ [SEUDAH]: 99 }), SEUDAH)).toBe(20);
    expect(effectiveLimit(config({ [SEUDAH]: -3 }), SEUDAH)).toBe(0);
    expect(clampLimit(NaN)).toBe(2);
  });

  it('legacy registration without status is approved', () => {
    expect(effectiveStatus(reg({ familyId: 'f1' }))).toBe('approved');
    expect(effectiveStatus(undefined)).toBe('approved');
  });

  it('limits are independent per meal', () => {
    const c = config({ 'סעודת ערב שבת': 3, 'סעודת שבת': 1 });
    expect(effectiveLimit(c, 'סעודת ערב שבת')).toBe(3);
    expect(effectiveLimit(c, 'סעודת שבת')).toBe(1);
    expect(effectiveLimit(c, 'סעודה שלישית')).toBe(2);
  });
});

// ── rollout gating ──────────────────────────────────────────────────────────
describe('limitAppliesToEvent (rollout from next Shabbat)', () => {
  it('does not apply to events before the start date (historical events untouched)', () => {
    expect(limitAppliesToEvent(gatedEvent({ date: ts('2026-08-01') }))).toBe(false);
    expect(limitAppliesToEvent(gatedEvent({ date: ts('2025-01-01') }))).toBe(false);
  });

  it('applies to Shabbat and holiday events after the start date', () => {
    expect(limitAppliesToEvent(gatedEvent({ date: ts('2026-08-07') }))).toBe(true);
    expect(limitAppliesToEvent(gatedEvent({ type: 'holiday', date: ts('2026-09-11') }))).toBe(true);
  });

  it('never applies to non Shabbat/holiday events or missing events', () => {
    expect(limitAppliesToEvent(gatedEvent({ type: 'event' }))).toBe(false);
    expect(limitAppliesToEvent(undefined)).toBe(false);
    expect(limitAppliesToEvent(null)).toBe(false);
  });

  it('start date is 2026-08-02 (first gated Shabbat: Aug 7-8)', () => {
    expect(FAMILY_LIMIT_START.getFullYear()).toBe(2026);
    expect(FAMILY_LIMIT_START.getMonth()).toBe(7);
    expect(FAMILY_LIMIT_START.getDate()).toBe(2);
  });
});

// ── countApprovedGuestFamilies ──────────────────────────────────────────────
describe('countApprovedGuestFamilies', () => {
  const f1 = family({ id: 'f1' });
  const f2 = family({ id: 'f2' });
  const couple = family({ id: 'c1', kids: 0 });

  it('counts only approved complete families; pending/rejected/cancelled never count', () => {
    const regs = [
      reg({ familyId: 'f1' }),                                   // legacy ⇒ approved
      reg({ familyId: 'f2', status: 'pendingAdminApproval' }),
      reg({ familyId: 'c1', adults: 2, kids: 0 }),               // couple — approved but not counted
    ];
    expect(countApprovedGuestFamilies({ mealRegs: regs, familiesById: famMap(f1, f2, couple) })).toBe(1);
  });

  it('rejected and cancelled do not count', () => {
    const regs = [
      reg({ familyId: 'f1', status: 'rejected' }),
      reg({ familyId: 'f2', status: 'cancelled' }),
    ];
    expect(countApprovedGuestFamilies({ mealRegs: regs, familiesById: famMap(f1, f2) })).toBe(0);
  });

  it('the same family is not counted twice for one meal (duplicate records)', () => {
    const regs = [reg({ familyId: 'f1' }), reg({ familyId: 'f1' })];
    expect(countApprovedGuestFamilies({ mealRegs: regs, familiesById: famMap(f1) })).toBe(1);
  });

  it('host-invited and admin-approved families count', () => {
    const regs = [
      reg({ familyId: 'f1', status: 'approved', approvalSource: 'hostInvited' }),
      reg({ familyId: 'f2', status: 'approved', approvalSource: 'adminApproved' }),
    ];
    expect(countApprovedGuestFamilies({ mealRegs: regs, familiesById: famMap(f1, f2) })).toBe(2);
  });

  it('complete families sleeping over (room bookings) count; external guests never do', () => {
    const regs = [reg({ familyId: 'f1' })];
    const bookings = [
      booking({ familyId: 'f2', adults: 2, kids: 3 }),
      booking({ familyId: 'x', isExternalGuest: true, adults: 2, kids: 2 }),
    ];
    expect(countApprovedGuestFamilies({
      mealRegs: regs, mealBookings: bookings, familiesById: famMap(f1, f2),
    })).toBe(2);
  });

  it('a family registered both directly and via a room counts once', () => {
    const regs = [reg({ familyId: 'f1' })];
    const bookings = [booking({ familyId: 'f1', adults: 2, kids: 3 })];
    expect(countApprovedGuestFamilies({
      mealRegs: regs, mealBookings: bookings, familiesById: famMap(f1),
    })).toBe(1);
  });

  it('the host family never counts even when registered', () => {
    const regs = [reg({ familyId: 'f1' })];
    expect(countApprovedGuestFamilies({
      mealRegs: regs, familiesById: famMap(f1), hostFamilyId: 'f1',
    })).toBe(0);
  });
});

// ── evaluateNewRequest ──────────────────────────────────────────────────────
describe('evaluateNewRequest', () => {
  const fam = family({ id: 'f3' });

  it('a complete family is automatically approved when capacity exists', () => {
    expect(evaluateNewRequest({
      event: gatedEvent(), config: config(), seudahType: SEUDAH,
      family: fam, attendingAdults: 2, attendingKids: 3, approvedCount: 1,
    })).toBe('approved');
  });

  it('a complete family becomes pending when capacity is full — not rejected', () => {
    const status = evaluateNewRequest({
      event: gatedEvent(), config: config(), seudahType: SEUDAH,
      family: fam, attendingAdults: 2, attendingKids: 3, approvedCount: 2,
    });
    expect(status).toBe('pendingAdminApproval');
    expect(status).not.toBe('rejected');
  });

  it('non-counted guests are always approved through existing logic (even at limit 0)', () => {
    const couple = family({ id: 'c1', kids: 0 });
    expect(evaluateNewRequest({
      event: gatedEvent(), config: config({ [SEUDAH]: 0 }), seudahType: SEUDAH,
      family: couple, attendingAdults: 2, attendingKids: 0, approvedCount: 99,
    })).toBe('approved');
  });

  it('limit 0 sends every complete family to admin approval', () => {
    expect(evaluateNewRequest({
      event: gatedEvent(), config: config({ [SEUDAH]: 0 }), seudahType: SEUDAH,
      family: fam, attendingAdults: 2, attendingKids: 3, approvedCount: 0,
    })).toBe('pendingAdminApproval');
  });

  it('pre-rollout events are always approved (old behavior preserved)', () => {
    expect(evaluateNewRequest({
      event: gatedEvent({ date: ts('2026-07-31') }), config: config(), seudahType: SEUDAH,
      family: fam, attendingAdults: 2, attendingKids: 3, approvedCount: 99,
    })).toBe('approved');
  });

  it('the host family is always approved', () => {
    expect(evaluateNewRequest({
      event: gatedEvent(), config: config({}, 'f3'), seudahType: SEUDAH,
      family: fam, attendingAdults: 2, attendingKids: 3, approvedCount: 99,
    })).toBe('approved');
  });

  it('admin over-limit approvals keep new requests pending until count falls below limit', () => {
    // approvedCount 3 > limit 2 — new counted request stays pending
    expect(evaluateNewRequest({
      event: gatedEvent(), config: config(), seudahType: SEUDAH,
      family: fam, attendingAdults: 2, attendingKids: 3, approvedCount: 3,
    })).toBe('pendingAdminApproval');
  });
});

// ── FIFO queue + promotion ──────────────────────────────────────────────────
function tsAt(ms: number) {
  return { toMillis: () => ms, toDate: () => new Date(ms) } as SeudahRegistration['createdAt'];
}

describe('sortPendingFifo', () => {
  it('sorts by requestedAt ascending with createdAt fallback', () => {
    const a = reg({ familyId: 'a', status: 'pendingAdminApproval', requestedAt: tsAt(300) });
    const b = reg({ familyId: 'b', status: 'pendingAdminApproval', createdAt: tsAt(100) });
    const c = reg({ familyId: 'c', status: 'pendingAdminApproval', requestedAt: tsAt(200) });
    expect(sortPendingFifo([a, b, c]).map(r => r.familyId)).toEqual(['b', 'c', 'a']);
  });
});

describe('planPromotions', () => {
  const f1 = family({ id: 'f1' });
  const f2 = family({ id: 'f2' });
  const f3 = family({ id: 'f3' });
  const f4 = family({ id: 'f4' });
  const fams = famMap(f1, f2, f3, f4);

  it('cancelling an approved family promotes the oldest pending request', () => {
    // f1 approved, f2+f3 pending → capacity 1 free ⇒ promote f2 (oldest) only
    const regs = [
      reg({ familyId: 'f1' }),
      reg({ familyId: 'f2', status: 'pendingAdminApproval', requestedAt: tsAt(100) }),
      reg({ familyId: 'f3', status: 'pendingAdminApproval', requestedAt: tsAt(200) }),
    ];
    const plan = planPromotions({ config: config(), seudahType: SEUDAH, mealRegs: regs, familiesById: fams });
    expect(plan.map(r => r.familyId)).toEqual(['f2']);
  });

  it('increasing the limit promotes requests in FIFO order', () => {
    const regs = [
      reg({ familyId: 'f1' }),
      reg({ familyId: 'f2' }),
      reg({ familyId: 'f3', status: 'pendingAdminApproval', requestedAt: tsAt(100) }),
      reg({ familyId: 'f4', status: 'pendingAdminApproval', requestedAt: tsAt(50) }),
    ];
    const plan = planPromotions({
      config: config({ [SEUDAH]: 3 }), seudahType: SEUDAH, mealRegs: regs, familiesById: fams,
    });
    expect(plan.map(r => r.familyId)).toEqual(['f4']); // oldest first, one place only
  });

  it('decreasing the limit below approved count never revokes approvals', () => {
    const regs = [reg({ familyId: 'f1' }), reg({ familyId: 'f2' }), reg({ familyId: 'f3' })];
    const plan = planPromotions({
      config: config({ [SEUDAH]: 1 }), seudahType: SEUDAH, mealRegs: regs, familiesById: fams,
    });
    expect(plan).toEqual([]); // nothing to demote, nothing promoted
  });

  it('host-invited families keep counting toward capacity — pending stays pending', () => {
    // limit 2; f1 cancelled, but f2 (hostInvited) + f3 approved ⇒ still full
    const regs = [
      reg({ familyId: 'f1', status: 'cancelled' }),
      reg({ familyId: 'f2', status: 'approved', approvalSource: 'hostInvited' }),
      reg({ familyId: 'f3', status: 'approved' }),
      reg({ familyId: 'f4', status: 'pendingAdminApproval', requestedAt: tsAt(10) }),
    ];
    const plan = planPromotions({ config: config(), seudahType: SEUDAH, mealRegs: regs, familiesById: fams });
    expect(plan).toEqual([]);
  });

  it('a pending group that stopped qualifying is approved without consuming a place', () => {
    // f2 pending but only partial kids now → promoted freely; f3 pending counted gets the place
    const regs = [
      reg({ familyId: 'f1' }),
      reg({ familyId: 'f2', status: 'pendingAdminApproval', kids: 1, requestedAt: tsAt(10) }),
      reg({ familyId: 'f3', status: 'pendingAdminApproval', requestedAt: tsAt(20) }),
    ];
    const plan = planPromotions({ config: config(), seudahType: SEUDAH, mealRegs: regs, familiesById: fams });
    expect(plan.map(r => r.familyId)).toEqual(['f2', 'f3']);
  });

  it('an approved family removing one child frees its place for the oldest pending', () => {
    // Scenario D: f1 approved but now partial (kids 2 of 3) → no longer counted
    const regs = [
      reg({ familyId: 'f1', kids: 2 }),
      reg({ familyId: 'f2' }),
      reg({ familyId: 'f3', status: 'pendingAdminApproval', requestedAt: tsAt(10) }),
    ];
    const plan = planPromotions({ config: config(), seudahType: SEUDAH, mealRegs: regs, familiesById: fams });
    expect(plan.map(r => r.familyId)).toEqual(['f3']);
  });
});

// ── per-meal independence + doc id ──────────────────────────────────────────
describe('per-meal independence', () => {
  const f1 = family({ id: 'f1' });

  it('the same family may count independently for two meals', () => {
    const dinner = [reg({ familyId: 'f1', seudahId: 's-dinner' })];
    const lunch = [reg({ familyId: 'f1', seudahId: 's-lunch' })];
    expect(countApprovedGuestFamilies({ mealRegs: dinner, familiesById: famMap(f1) })).toBe(1);
    expect(countApprovedGuestFamilies({ mealRegs: lunch, familiesById: famMap(f1) })).toBe(1);
  });

  it("one meal's status does not affect another meal", () => {
    // Scenario C: same family — dinner approved, lunch pending
    const dinner = reg({ familyId: 'f1', seudahId: 's-dinner', status: 'approved' });
    const lunch = reg({ familyId: 'f1', seudahId: 's-lunch', status: 'pendingAdminApproval' });
    expect(effectiveStatus(dinner)).toBe('approved');
    expect(effectiveStatus(lunch)).toBe('pendingAdminApproval');
  });

  it('registrationDocId is unique per event+meal+family', () => {
    expect(registrationDocId('ev1__סעודת שבת', 'f1')).toBe('ev1__סעודת שבת__f1');
    expect(registrationDocId('a/b', 'f/1')).not.toContain('/');
  });
});

// ── Integration scenarios (A + B from the spec) ─────────────────────────────
describe('integration scenarios', () => {
  const A = family({ id: 'A' });
  const B = family({ id: 'B' });
  const C = family({ id: 'C' });
  const D = family({ id: 'D' });
  const couple = family({ id: 'couple', kids: 0 });
  const fams = famMap(A, B, C, D, couple);
  const ev = gatedEvent();

  it('Scenario A: cancel + host invite keeps C pending', () => {
    const cfg = config(); // limit 2
    const mkReq = (fam: Family, approvedCount: number) =>
      evaluateNewRequest({
        event: ev, config: cfg, seudahType: SEUDAH,
        family: fam, attendingAdults: 2, attendingKids: fam.kids, approvedCount,
      });

    let regs: SeudahRegistration[] = [];
    const count = () => countApprovedGuestFamilies({ mealRegs: regs, familiesById: fams });

    // A requests → approved
    expect(mkReq(A, count())).toBe('approved');
    regs.push(reg({ familyId: 'A', status: 'approved' }));
    // B requests → approved
    expect(mkReq(B, count())).toBe('approved');
    regs.push(reg({ familyId: 'B', status: 'approved' }));
    // C requests → pending
    expect(mkReq(C, count())).toBe('pendingAdminApproval');
    regs.push(reg({ familyId: 'C', status: 'pendingAdminApproval', requestedAt: tsAt(10) }));
    // Couple without children → approved and not counted
    expect(mkReq(couple, count())).toBe('approved');
    regs.push(reg({ familyId: 'couple', kids: 0, status: 'approved' }));
    expect(count()).toBe(2);
    // Host invites D → approved above the limit, counts toward capacity
    regs.push(reg({ familyId: 'D', status: 'approved', approvalSource: 'hostInvited' }));
    expect(count()).toBe(3);
    // A cancels → still 2 approved (B + D) ⇒ C remains pending
    regs = regs.filter(r => r.familyId !== 'A');
    expect(count()).toBe(2);
    const plan = planPromotions({ config: cfg, seudahType: SEUDAH, mealRegs: regs, familiesById: fams });
    expect(plan).toEqual([]);
  });

  it('Scenario B: limit increase 3→4 approves only the oldest pending', () => {
    const regs = [
      reg({ familyId: 'A', status: 'approved' }),
      reg({ familyId: 'B', status: 'approved' }),
      reg({ familyId: 'C', status: 'pendingAdminApproval', requestedAt: tsAt(100) }),
      reg({ familyId: 'D', status: 'pendingAdminApproval', requestedAt: tsAt(200) }),
    ];
    // While limit was 3, one place was free but C/D pending (e.g. requested at full moment)
    const plan = planPromotions({
      config: config({ [SEUDAH]: 4 }), seudahType: SEUDAH, mealRegs: regs, familiesById: fams,
    });
    // limit 4, approved 2 ⇒ two places ⇒ both C and D in FIFO order
    expect(plan.map(r => r.familyId)).toEqual(['C', 'D']);

    const planOne = planPromotions({
      config: config({ [SEUDAH]: 3 }), seudahType: SEUDAH, mealRegs: regs, familiesById: fams,
    });
    expect(planOne.map(r => r.familyId)).toEqual(['C']); // oldest first, second stays pending
  });
});
