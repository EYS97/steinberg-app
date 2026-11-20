import { useState, useEffect, useCallback } from 'react';
import {
  doc, collection, query, where, onSnapshot,
  setDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, writeBatch, deleteField,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { planDocId } from '@/lib/august/plan';
import {
  AUGUST_MONTH, DEFAULT_COVERAGE_START, DEFAULT_COVERAGE_END,
} from '@/types/august';
import type {
  FamilyAugustPlan, AugustTimelineItem, AugustMember, AugustTask,
} from '@/types/august';

const PLANS = 'augustPlans';
const ITEMS = 'augustTimelineItems';

interface UseAugustPlan {
  plan: FamilyAugustPlan | null;
  items: AugustTimelineItem[];
  loading: boolean;
  ensurePlan: (seedMembers?: AugustMember[]) => Promise<void>;
  updatePlan: (patch: Partial<FamilyAugustPlan>) => Promise<void>;
  setMembers: (members: AugustMember[]) => Promise<void>;
  setDayNote: (date: string, note: string) => Promise<void>;
  setDayTasks: (date: string, tasks: AugustTask[]) => Promise<void>;
  addItem: (item: Omit<AugustTimelineItem, 'id' | 'planId' | 'nuclearFamilyId'>) => Promise<void>;
  /** Atomic multi-add — used for family-holiday fan-out (all copies or none). */
  addItems: (items: Omit<AugustTimelineItem, 'id' | 'planId' | 'nuclearFamilyId'>[]) => Promise<void>;
  updateItem: (id: string, patch: Partial<AugustTimelineItem>) => Promise<void>;
  /** Atomic per-item patches across a shared-event group (one batch commit). */
  updateItems: (patches: Array<{ id: string; patch: Partial<AugustTimelineItem> }>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  /** Atomic multi-delete — removing a family holiday for everyone at once. */
  deleteItems: (ids: string[]) => Promise<void>;
}

/**
 * Live plan + timeline for one nuclear family's August. The timeline query
 * filters on a single field (nuclearFamilyId) so it needs no composite index.
 * Pass an empty familyId to stay idle (e.g. before a family is chosen).
 */
export function useAugustPlan(familyId: string, year: number): UseAugustPlan {
  const [plan, setPlan] = useState<FamilyAugustPlan | null>(null);
  const [items, setItems] = useState<AugustTimelineItem[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);

  const planId = familyId ? planDocId(familyId, year) : '';

  useEffect(() => {
    if (!familyId) { setPlan(null); setPlanLoading(false); return; }
    setPlanLoading(true);
    const unsub = onSnapshot(
      doc(db, PLANS, planId),
      snap => {
        setPlan(snap.exists() ? ({ id: snap.id, ...snap.data() } as FamilyAugustPlan) : null);
        setPlanLoading(false);
      },
      () => setPlanLoading(false)
    );
    return unsub;
  }, [familyId, planId]);

  useEffect(() => {
    if (!familyId) { setItems([]); setItemsLoading(false); return; }
    setItemsLoading(true);
    const q = query(collection(db, ITEMS), where('nuclearFamilyId', '==', familyId));
    const unsub = onSnapshot(
      q,
      snap => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as AugustTimelineItem)));
        setItemsLoading(false);
      },
      () => setItemsLoading(false)
    );
    return unsub;
  }, [familyId]);

  const ensurePlan = useCallback(async (seedMembers: AugustMember[] = []) => {
    if (!familyId || plan) return;
    const fresh: Omit<FamilyAugustPlan, 'id'> = {
      nuclearFamilyId: familyId,
      year,
      month: AUGUST_MONTH,
      coverageStart: DEFAULT_COVERAGE_START,
      coverageEnd: DEFAULT_COVERAGE_END,
      members: seedMembers,
      dayNotes: {},
      createdAt: serverTimestamp() as never,
      updatedAt: serverTimestamp() as never,
    };
    await setDoc(doc(db, PLANS, planId), fresh, { merge: true });
  }, [familyId, planId, plan, year]);

  const updatePlan = useCallback(async (patch: Partial<FamilyAugustPlan>) => {
    if (!planId) return;
    await setDoc(
      doc(db, PLANS, planId),
      { ...patch, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }, [planId]);

  const setMembers = useCallback(
    (members: AugustMember[]) => updatePlan({ members }),
    [updatePlan]
  );

  const setDayNote = useCallback(
    (date: string, note: string) => updatePlan({ dayNotes: { ...(plan?.dayNotes ?? {}), [date]: note } }),
    [updatePlan, plan]
  );

  const setDayTasks = useCallback(
    (date: string, tasks: AugustTask[]) => updatePlan({ dayTasks: { ...(plan?.dayTasks ?? {}), [date]: tasks } }),
    [updatePlan, plan]
  );

  // Items are their own collection (independent of the plan doc); the page is
  // responsible for persisting members before the first add.
  const addItem = useCallback(async (
    item: Omit<AugustTimelineItem, 'id' | 'planId' | 'nuclearFamilyId'>
  ) => {
    if (!familyId) return;
    await addDoc(collection(db, ITEMS), {
      ...stripUndefined(item),
      planId,
      nuclearFamilyId: familyId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [familyId, planId]);

  const addItems = useCallback(async (
    drafts: Omit<AugustTimelineItem, 'id' | 'planId' | 'nuclearFamilyId'>[]
  ) => {
    if (!familyId || drafts.length === 0) return;
    const batch = writeBatch(db);
    for (const draft of drafts) {
      batch.set(doc(collection(db, ITEMS)), {
        ...stripUndefined(draft),
        planId,
        nuclearFamilyId: familyId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }, [familyId, planId]);

  const updateItem = useCallback(async (id: string, patch: Partial<AugustTimelineItem>) => {
    await updateDoc(doc(db, ITEMS, id), {
      ...clearUndefined(patch),
      updatedAt: serverTimestamp(),
    });
  }, []);

  const updateItems = useCallback(async (
    patches: Array<{ id: string; patch: Partial<AugustTimelineItem> }>
  ) => {
    if (patches.length === 0) return;
    const batch = writeBatch(db);
    for (const { id, patch } of patches) {
      batch.update(doc(db, ITEMS, id), {
        ...clearUndefined(patch),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    await deleteDoc(doc(db, ITEMS, id));
  }, []);

  const deleteItems = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const batch = writeBatch(db);
    for (const id of ids) batch.delete(doc(db, ITEMS, id));
    await batch.commit();
  }, []);

  return {
    plan,
    items,
    loading: planLoading || itemsLoading,
    ensurePlan,
    updatePlan,
    setMembers,
    setDayNote,
    setDayTasks,
    addItem,
    addItems,
    updateItem,
    updateItems,
    deleteItem,
    deleteItems,
  };
}

/** Firestore rejects `undefined` field values — drop them before writing. */
function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/**
 * For UPDATES an explicitly-undefined key means "clear this field" (the item
 * form sets endDate/notes/etc. to undefined to remove them) — translate to
 * deleteField() so the stored doc doesn't keep a stale value.
 */
function clearUndefined<T extends object>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === undefined ? deleteField() : v;
  }
  return out;
}
