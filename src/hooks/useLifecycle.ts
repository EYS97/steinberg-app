import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { User } from 'firebase/auth';
import type { TreePerson } from '@/types';
import {
  LIFECYCLE_COLLECTION,
  completionKey,
  resolveEligibleOnboarding,
  buildOnboardingContext,
  lifecycleAnniversaryEntries,
  shouldShowWelcomeCard,
  seasonalFirstRoshHashanah,
  type LifecycleEvent,
  type OnboardingContext,
  type OnboardingStates,
  type SeasonalRoshHashanah,
} from '@/lib/lifecycle';
import type { AnnualEntry } from '@/lib/familyEvents';

// Family-lifecycle wiring: the `familyLifecycle` collection (records describing
// weddings and future family transitions) plus this user's own onboarding
// completion state, which lives on their `userActivity` doc — the same
// user-writable doc that already remembers the August family selection.
//
// Nothing here knows any person's name: eligibility comes from the record's
// memberEmails, and all copy is derived from the family tree.

const LS_PREFIX = 'lifecycle_done_';

/** Locally-mirrored completions, so a completed flow never flashes on reload. */
function readLocalDone(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(LS_PREFIX + key) === '1'; } catch { return false; }
}

function writeLocalDone(key: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_PREFIX + key, '1'); } catch { /* ignore */ }
}

/** Live list of lifecycle records (read-only; used by Admin and the hub). */
export function useLifecycleEvents() {
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, LIFECYCLE_COLLECTION),
      snap => {
        setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as LifecycleEvent)));
        setLoading(false);
      },
      err => { console.error('familyLifecycle load error:', err); setLoading(false); }
    );
    return unsub;
  }, []);

  return { events, loading };
}

export interface LifecycleState {
  events: LifecycleEvent[];
  loading: boolean;
  /** The onboarding this user should be offered right now (null for everyone else). */
  eligible: LifecycleEvent | null;
  /** Display context for `eligible`, derived from the family tree. */
  context: OnboardingContext | null;
  /** The user's completed/dismissed onboarding state. */
  states: OnboardingStates;
  /** A finished onboarding whose temporary welcome card is still due. */
  welcomeFor: LifecycleEvent | null;
  welcomeContext: OnboardingContext | null;
  /** Seasonal "first Rosh Hashanah" moment for `welcomeFor`, when in season. */
  seasonal: SeasonalRoshHashanah | null;
  /** Anniversary entries for the family-events hub (derived, never written). */
  anniversaries: AnnualEntry[];
  completeOnboarding: (ev: LifecycleEvent) => Promise<void>;
  dismissWelcomeCard: (ev: LifecycleEvent) => Promise<void>;
}

/**
 * Resolve everything the app needs about family-lifecycle onboarding for the
 * signed-in user.
 *
 * The family tree is only loaded when a lifecycle record actually exists — the
 * tree carries embedded profile photos, and no screen should pay for it just to
 * discover there is nothing to show (which is the case for every member without
 * a wedding record).
 */
export function useLifecycle(
  user: User | null,
  now: Date = new Date()
): LifecycleState {
  const { events, loading } = useLifecycleEvents();
  const [states, setStates] = useState<OnboardingStates>({});
  const [persons, setPersons] = useState<TreePerson[]>([]);

  const needsTree = events.length > 0;
  useEffect(() => {
    if (!needsTree) { setPersons([]); return; }
    const unsub = onSnapshot(
      collection(db, 'familyTree'),
      snap => setPersons(snap.docs.map(d => ({ id: d.id, ...d.data() } as TreePerson))),
      err => console.error('familyTree load error (lifecycle):', err)
    );
    return unsub;
  }, [needsTree]);

  // The user's own activity doc holds the onboarding completion map.
  useEffect(() => {
    if (!user) { setStates({}); return; }
    const unsub = onSnapshot(
      doc(db, 'userActivity', user.uid),
      snap => setStates((snap.data()?.onboardings ?? {}) as OnboardingStates),
      () => { /* offline — the localStorage mirror still guards replay */ }
    );
    return unsub;
  }, [user]);

  // Merge in locally-mirrored completions so a completed onboarding cannot
  // reappear during the moment before the snapshot arrives.
  const mergedStates = useMemo(() => {
    const out: OnboardingStates = { ...states };
    for (const ev of events) {
      const key = completionKey(ev);
      if (!out[key]?.completedAt && readLocalDone(key)) {
        out[key] = { ...out[key], completedAt: now };
      }
    }
    return out;
    // `now` is intentionally excluded: it only stamps a local fallback value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states, events]);

  const eligible = useMemo(
    () => (loading ? null : resolveEligibleOnboarding(user?.email, events, mergedStates)),
    [loading, user, events, mergedStates]
  );

  const context = useMemo(
    () => (eligible ? buildOnboardingContext(eligible, persons) : null),
    [eligible, persons]
  );

  // A record this user completed, still inside the welcome-card window.
  const welcomeFor = useMemo(() => {
    const mine = events.filter(ev =>
      (ev.memberEmails || []).some(e => (e || '').trim().toLowerCase() === (user?.email || '').trim().toLowerCase())
    );
    return mine.find(ev => user?.email && shouldShowWelcomeCard(ev, mergedStates, now)) ?? null;
  }, [events, user, mergedStates, now]);

  const welcomeContext = useMemo(
    () => (welcomeFor ? buildOnboardingContext(welcomeFor, persons) : null),
    [welcomeFor, persons]
  );

  const seasonal = useMemo(
    () => (welcomeFor ? seasonalFirstRoshHashanah(welcomeFor, mergedStates, now) : null),
    [welcomeFor, mergedStates, now]
  );

  const anniversaries = useMemo(
    () => lifecycleAnniversaryEntries(events, persons),
    [events, persons]
  );

  const completeOnboarding = useCallback(async (ev: LifecycleEvent) => {
    const key = completionKey(ev);
    writeLocalDone(key); // idempotent guard first — survives a failed write
    if (!user) return;
    await setDoc(
      doc(db, 'userActivity', user.uid),
      { onboardings: { [key]: { completedAt: serverTimestamp() } } },
      { merge: true }
    );
  }, [user]);

  const dismissWelcomeCard = useCallback(async (ev: LifecycleEvent) => {
    const key = completionKey(ev);
    if (!user) return;
    await setDoc(
      doc(db, 'userActivity', user.uid),
      { onboardings: { [key]: { welcomeCardDismissedAt: serverTimestamp() } } },
      { merge: true }
    );
  }, [user]);

  return {
    events,
    loading,
    eligible,
    context,
    states: mergedStates,
    welcomeFor,
    welcomeContext,
    seasonal,
    anniversaries,
    completeOnboarding,
    dismissWelcomeCard,
  };
}
