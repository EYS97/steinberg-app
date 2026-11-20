import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { User } from 'firebase/auth';
import type { Family } from '@/types';

// "Self-pick + remember" family resolution for the August planner.
// A user's chosen family id is stored on their own userActivity doc (which
// Firestore rules already let them write) and mirrored to localStorage so the
// choice survives an offline first paint. Admins use the same mechanism plus
// a visible family switcher in the page.

const LS_KEY = 'august_familyId';

function readLocal(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(LS_KEY); } catch { return null; }
}

function writeLocal(id: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_KEY, id); } catch { /* ignore */ }
}

interface AugustFamilyState {
  /** Resolved family id, or '' if none chosen yet. */
  familyId: string;
  family: Family | null;
  /** Still loading the remembered selection. */
  resolving: boolean;
  /** Persist a new selection (remembers it on the user's activity doc). */
  selectFamily: (id: string) => void;
}

export function useAugustFamily(
  user: User | null,
  families: Family[]
): AugustFamilyState {
  const [familyId, setFamilyId] = useState<string>(() => readLocal() ?? '');
  const [resolving, setResolving] = useState(true);

  // Load the remembered selection from the user's activity doc.
  useEffect(() => {
    let cancelled = false;
    if (!user) { setResolving(false); return; }
    getDoc(doc(db, 'userActivity', user.uid))
      .then(snap => {
        if (cancelled) return;
        const stored = snap.exists() ? (snap.data().augustFamilyId as string | undefined) : undefined;
        if (stored) { setFamilyId(stored); writeLocal(stored); }
      })
      .catch(() => { /* fall back to localStorage value */ })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [user]);

  // Drop a stale selection if that family no longer exists.
  useEffect(() => {
    if (resolving || !familyId || families.length === 0) return;
    if (!families.some(f => f.id === familyId)) setFamilyId('');
  }, [resolving, familyId, families]);

  const selectFamily = useCallback((id: string) => {
    setFamilyId(id);
    writeLocal(id);
    if (user) {
      setDoc(doc(db, 'userActivity', user.uid), { augustFamilyId: id }, { merge: true })
        .catch(() => { /* localStorage already holds it */ });
    }
  }, [user]);

  const family = families.find(f => f.id === familyId) ?? null;

  return { familyId, family, resolving, selectFamily };
}
