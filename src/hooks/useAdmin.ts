import { useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { User } from 'firebase/auth';

export function useAdmin(user: User | null): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }

    const unsub = onSnapshot(doc(db, 'settings', 'admins'), (snap) => {
      if (!snap.exists()) { setIsAdmin(false); return; }
      const data = snap.data();
      const admins: string[] = data.uids || [];
      setIsAdmin(admins.includes(user.uid));
    }, () => setIsAdmin(false));

    return unsub;
  }, [user]);

  return isAdmin;
}

export async function claimAdmin(uid: string): Promise<void> {
  const ref = doc(db, 'settings', 'admins');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const { setDoc } = await import('firebase/firestore');
    await setDoc(ref, { uids: [uid] });
  } else {
    await updateDoc(ref, { uids: arrayUnion(uid) });
  }
}

export async function revokeAdmin(uid: string): Promise<void> {
  const ref = doc(db, 'settings', 'admins');
  await updateDoc(ref, { uids: arrayRemove(uid) });
}

export async function approveUser(uid: string, email: string): Promise<void> {
  const ref = doc(db, 'settings', 'approvedUsers');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const { setDoc } = await import('firebase/firestore');
    await setDoc(ref, { uids: [uid], emails: [email] });
  } else {
    await updateDoc(ref, { uids: arrayUnion(uid), emails: arrayUnion(email) });
  }
}
