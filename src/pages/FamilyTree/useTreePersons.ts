import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { TreePerson } from '@/types';

/**
 * Read-only live subscription to the `familyTree` collection, shared by the
 * new Family-Tree experience. A module-level cache keeps the tree on screen
 * instantly when the page is revisited (no skeleton flash). This hook never
 * writes — it only reads snapshots.
 */
let personsCache: TreePerson[] | null = null;

export function useTreePersons() {
  const [persons, setPersons] = useState<TreePerson[]>(personsCache ?? []);
  const [loading, setLoading] = useState(personsCache === null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'familyTree'),
      (snap) => {
        personsCache = snap.docs.map(d => ({ id: d.id, ...d.data() } as TreePerson));
        setPersons(personsCache);
        setLoading(false);
      },
      (err) => { console.error('familyTree load error:', err); setLoading(false); },
    );
    return unsub;
  }, []);

  return { persons, loading };
}
