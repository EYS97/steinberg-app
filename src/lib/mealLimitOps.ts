import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type {
  AppEvent,
  Booking,
  EventMealConfig,
  Family,
  MealLimitAudit,
  Seudah,
  SeudahRegistration,
} from '@/types';
import {
  clampLimit,
  effectiveLimit,
  evaluateNewRequest,
  countApprovedGuestFamilies,
  planPromotions,
  registrationDocId,
} from './familyLimit';

// ── Firestore operations for the guest-family-limit mechanism ─────────────
// All *decisions* live in familyLimit.ts (pure, tested); this file only turns
// decisions into transactional writes. Every write path re-verifies the target
// doc's status inside the transaction so two concurrent actors (two admins,
// two parents of one family, promotion racing an approval) cannot double-apply.

const REGS = 'seudahRegistrations';
const CONFIG = 'eventMealConfig';
const AUDIT = 'mealLimitAudit';

/** Best-effort audit entry — never blocks or fails the main action. */
export async function logMealLimitAudit(
  entry: Omit<MealLimitAudit, 'id' | 'createdAt'>
): Promise<void> {
  try {
    await addDoc(collection(db, AUDIT), { ...entry, createdAt: serverTimestamp() });
  } catch { /* silent — audit must never break the user action */ }
}

// ── Limit configuration ───────────────────────────────────────────────────

export interface SaveLimitResult {
  /** Families promoted because the limit increased (already written). */
  promoted: SeudahRegistration[];
}

/**
 * Save a new per-meal limit. On increase, promotes pending requests FIFO
 * (inside per-request transactions). On decrease, existing approvals are
 * untouched — the caller shows the "already above the limit" warning.
 */
export async function saveMealLimit(params: {
  eventId: string;
  seudahType: string;
  value: number;
  uid: string;
  previous: number;
  /** Live data for promotion planning after an increase. */
  config: EventMealConfig | null;
  seudah: Seudah;
  mealRegs: SeudahRegistration[];
  mealBookings: Booking[];
  familiesById: Map<string, Family>;
}): Promise<SaveLimitResult> {
  const { eventId, seudahType, uid, previous, seudah, mealRegs, mealBookings, familiesById } = params;
  const value = clampLimit(params.value);

  await setDoc(
    doc(db, CONFIG, eventId),
    { limits: { [seudahType]: value }, updatedAt: serverTimestamp(), updatedBy: uid },
    { merge: true }
  );
  void logMealLimitAudit({
    action: 'mealFamilyLimitChanged',
    eventId,
    seudahType,
    performedByUserId: uid,
    previousValue: previous,
    newValue: value,
  });

  let promoted: SeudahRegistration[] = [];
  if (value > previous) {
    const newConfig: EventMealConfig = {
      ...(params.config ?? { id: eventId }),
      id: eventId,
      limits: { ...(params.config?.limits ?? {}), [seudahType]: value },
    };
    promoted = await promotePendingFamilies({
      config: newConfig,
      seudah,
      mealRegs,
      mealBookings,
      familiesById,
      performedByUserId: uid,
    });
  }
  return { promoted };
}

// ── Request submission ────────────────────────────────────────────────────

export interface SubmitTarget {
  seudah: Seudah;
  /** ALL current registrations of this seudah (any status). */
  mealRegs: SeudahRegistration[];
  /** Room bookings participating in this seudah. */
  mealBookings: Booking[];
}

export interface SubmitResult {
  approvedSeudot: Seudah[];
  pendingSeudot: Seudah[];
}

/**
 * Submit a family's attendance request for one or more seudot. Each meal is
 * evaluated independently: within capacity (or not a counted family, or a
 * pre-rollout event) ⇒ approved instantly, exactly like the legacy flow;
 * over capacity ⇒ pendingAdminApproval (never rejected, never blocked).
 *
 * Uses a deterministic doc id (eventId+seudahId+familyId) created inside a
 * transaction, so two parents submitting simultaneously produce one request.
 */
export async function submitMealRequests(params: {
  event: AppEvent;
  config: EventMealConfig | null;
  family: Family;
  familyName: string;
  bringing: string;
  uid: string;
  targets: SubmitTarget[];
  familiesById: Map<string, Family>;
}): Promise<SubmitResult> {
  const { event, config, family, familyName, bringing, uid, targets, familiesById } = params;
  const adults = family.adults || 0;
  const kids = family.kids || 0;
  const result: SubmitResult = { approvedSeudot: [], pendingSeudot: [] };

  for (const t of targets) {
    const approvedCount = countApprovedGuestFamilies({
      mealRegs: t.mealRegs,
      mealBookings: t.mealBookings,
      familiesById,
      hostFamilyId: config?.hostFamilyId,
    });
    const status = evaluateNewRequest({
      event,
      config,
      seudahType: t.seudah.type,
      family,
      attendingAdults: adults,
      attendingKids: kids,
      approvedCount,
    });

    const regRef = doc(db, REGS, registrationDocId(t.seudah.id, family.id));
    await runTransaction(db, async txn => {
      const existing = await txn.get(regRef);
      // One request per family per meal: re-submitting after cancellation gets a
      // fresh requestedAt (end of queue); an active request is left untouched.
      if (existing.exists()) {
        const st = (existing.data() as SeudahRegistration).status ?? 'approved';
        if (st === 'approved' || st === 'pendingAdminApproval') return;
      }
      txn.set(regRef, {
        seudahId: t.seudah.id,
        eventId: event.id,
        eventTitle: event.title || '',
        seudahType: t.seudah.type,
        familyId: family.id,
        familyName,
        adults,
        kids,
        diners: adults + kids,
        bringing,
        status,
        approvalSource: status === 'approved' ? 'automaticWithinLimit' : null,
        requestedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: uid,
        ...(status === 'approved' ? { approvedAt: serverTimestamp() } : {}),
      });
    });

    (status === 'approved' ? result.approvedSeudot : result.pendingSeudot).push(t.seudah);
    void logMealLimitAudit({
      action: status === 'approved' ? 'autoApproved' : 'sentToAdminApproval',
      eventId: event.id,
      seudahType: t.seudah.type,
      familyId: family.id,
      performedByUserId: uid,
    });
  }
  return result;
}

/** Host directly invites a family — approved immediately, may exceed the limit. */
export async function hostInviteFamily(params: {
  event: AppEvent;
  seudot: Seudah[];
  family: Family;
  familyName: string;
  uid: string;
}): Promise<void> {
  const { event, seudot, family, familyName, uid } = params;
  const adults = family.adults || 0;
  const kids = family.kids || 0;
  for (const s of seudot) {
    const regRef = doc(db, REGS, registrationDocId(s.id, family.id));
    await runTransaction(db, async txn => {
      const existing = await txn.get(regRef);
      if (existing.exists()) {
        const st = (existing.data() as SeudahRegistration).status ?? 'approved';
        if (st === 'approved') return; // already in — never downgrade
      }
      txn.set(regRef, {
        seudahId: s.id,
        eventId: event.id,
        eventTitle: event.title || '',
        seudahType: s.type,
        familyId: family.id,
        familyName,
        adults,
        kids,
        diners: adults + kids,
        bringing: '',
        status: 'approved',
        approvalSource: 'hostInvited',
        requestedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: uid,
        approvedAt: serverTimestamp(),
        approvedByUserId: uid,
      });
    });
    void logMealLimitAudit({
      action: 'hostInvitedFamily',
      eventId: event.id,
      seudahType: s.type,
      familyId: family.id,
      performedByUserId: uid,
    });
  }
}

// ── Admin approval / rejection ────────────────────────────────────────────

/** Approve inside a transaction — no-op if the request is no longer pending
 *  (e.g. two admins approving simultaneously). Returns true when applied. */
export async function adminApproveRequest(reg: SeudahRegistration, adminUid: string): Promise<boolean> {
  const ref = doc(db, REGS, reg.id);
  const applied = await runTransaction(db, async txn => {
    const snap = await txn.get(ref);
    if (!snap.exists()) return false;
    if ((snap.data() as SeudahRegistration).status !== 'pendingAdminApproval') return false;
    txn.update(ref, {
      status: 'approved',
      approvalSource: 'adminApproved',
      approvedAt: serverTimestamp(),
      approvedByUserId: adminUid,
    });
    return true;
  });
  if (applied) {
    void logMealLimitAudit({
      action: 'adminApproved',
      eventId: reg.eventId,
      seudahType: reg.seudahType,
      familyId: reg.familyId,
      performedByUserId: adminUid,
    });
  }
  return applied;
}

export async function adminRejectRequest(reg: SeudahRegistration, adminUid: string): Promise<boolean> {
  const ref = doc(db, REGS, reg.id);
  const applied = await runTransaction(db, async txn => {
    const snap = await txn.get(ref);
    if (!snap.exists()) return false;
    if ((snap.data() as SeudahRegistration).status !== 'pendingAdminApproval') return false;
    txn.update(ref, {
      status: 'rejected',
      rejectedAt: serverTimestamp(),
      rejectedByUserId: adminUid,
    });
    return true;
  });
  if (applied) {
    void logMealLimitAudit({
      action: 'adminRejected',
      eventId: reg.eventId,
      seudahType: reg.seudahType,
      familyId: reg.familyId,
      performedByUserId: adminUid,
    });
  }
  return applied;
}

// ── Cancellation + automatic promotion ────────────────────────────────────

/**
 * Cancel (remove) a registration — the legacy delete, unchanged — then promote
 * the oldest pending request if the cancellation freed a place.
 */
export async function cancelRegistrationAndPromote(params: {
  reg: SeudahRegistration;
  config: EventMealConfig | null;
  seudah: Seudah | undefined;
  /** Registrations of that seudah (will be filtered of the cancelled one). */
  mealRegs: SeudahRegistration[];
  mealBookings: Booking[];
  familiesById: Map<string, Family>;
  uid: string;
}): Promise<SeudahRegistration[]> {
  const { reg, config, seudah, mealBookings, familiesById, uid } = params;
  await deleteDoc(doc(db, REGS, reg.id));
  void logMealLimitAudit({
    action: 'attendanceCancelled',
    eventId: reg.eventId,
    seudahType: reg.seudahType ?? seudah?.type,
    familyId: reg.familyId,
    performedByUserId: uid,
  });
  if (!seudah) return [];
  const remaining = params.mealRegs.filter(r => r.id !== reg.id);
  return promotePendingFamilies({
    config: config ?? { id: reg.eventId },
    seudah,
    mealRegs: remaining,
    mealBookings,
    familiesById,
    performedByUserId: uid,
  });
}

/**
 * Approve pending requests FIFO while capacity exists. Each promotion is a
 * transaction that re-verifies the request is still pending, so a concurrent
 * admin action or second promotion pass cannot double-approve one place.
 * Returns the requests actually promoted (for notifications).
 */
export async function promotePendingFamilies(params: {
  config: EventMealConfig | null;
  seudah: Seudah;
  mealRegs: SeudahRegistration[];
  mealBookings: Booking[];
  familiesById: Map<string, Family>;
  performedByUserId: string;
}): Promise<SeudahRegistration[]> {
  const { config, seudah, mealRegs, mealBookings, familiesById, performedByUserId } = params;
  const plan = planPromotions({
    config,
    seudahType: seudah.type,
    mealRegs,
    mealBookings,
    familiesById,
  });

  const promoted: SeudahRegistration[] = [];
  for (const reg of plan) {
    const ref = doc(db, REGS, reg.id);
    const applied = await runTransaction(db, async txn => {
      const snap = await txn.get(ref);
      if (!snap.exists()) return false;
      if ((snap.data() as SeudahRegistration).status !== 'pendingAdminApproval') return false;
      txn.update(ref, {
        status: 'approved',
        approvalSource: 'automaticWithinLimit',
        approvedAt: serverTimestamp(),
        promotedAfterWait: true,
      });
      return true;
    });
    if (applied) {
      promoted.push(reg);
      void logMealLimitAudit({
        action: 'autoApprovedAfterCancellation',
        eventId: reg.eventId,
        seudahType: reg.seudahType ?? seudah.type,
        familyId: reg.familyId,
        performedByUserId,
      });
    }
  }
  return promoted;
}

/** Current effective limit — re-exported convenience for UI code. */
export { effectiveLimit };
