import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  getRedirectResult,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/firebase/config';

interface AuthState {
  user: User | null;
  loading: boolean;
  isApproved: boolean;
  isPending: boolean;
}

async function checkApproval(user: User): Promise<boolean> {
  try {
    const approvedDoc = await getDoc(doc(db, 'settings', 'approvedUsers'));
    if (approvedDoc.exists()) {
      const data = approvedDoc.data();
      const list: string[] = data.uids || [];
      if (list.includes(user.uid)) return true;
      const emailList: string[] = data.emails || [];
      if (user.email && emailList.includes(user.email)) return true;
      return false;
    }
    // No approval doc = open access (first-run or admin reset)
    return true;
  } catch {
    return true;
  }
}

async function registerPending(user: User): Promise<void> {
  try {
    const ref = doc(db, 'settings', 'pendingUsers');
    const snap = await getDoc(ref);
    const current = snap.exists() ? (snap.data().list || []) : [];
    const entry = { uid: user.uid, email: user.email, name: user.displayName, ts: new Date().toISOString() };
    if (!current.find((u: { uid: string }) => u.uid === user.uid)) {
      await setDoc(ref, { list: [...current, entry] }, { merge: true });
    }
  } catch { /* silent */ }
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    // Handle redirect result on load
    getRedirectResult(auth).catch(() => {});

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const approved = await checkApproval(firebaseUser);
        setIsApproved(approved);
        setIsPending(!approved);
        if (!approved) await registerPending(firebaseUser);
        else {
          // Log activity
          try {
            await setDoc(doc(db, 'userActivity', firebaseUser.uid), {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName,
              lastSeen: serverTimestamp(),
            }, { merge: true });
          } catch { /* silent */ }
        }
      } else {
        setIsApproved(false);
        setIsPending(false);
      }
      setLoading(false);
    });

    return unsub;
  }, []);

  return { user, loading, isApproved, isPending };
}

export function signInWithGoogle(): void {
  const provider = new GoogleAuthProvider();
  // Popup avoids the third-party-storage redirect failure when the app is
  // served from web.app while authDomain is firebaseapp.com.
  signInWithPopup(auth, provider).catch((err) => {
    if (err?.code === 'auth/popup-blocked') {
      signInWithRedirect(auth, provider);
    }
  });
}

export function signInWithEmail(email: string, password: string): Promise<void> {
  return signInWithEmailAndPassword(auth, email, password).then(() => undefined);
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}
