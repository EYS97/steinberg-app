// src/hooks/useAuth.js
import { useState, useEffect, createContext, useContext } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]         = useState(null);
  const [family, setFamily]     = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // load linked family profile
        const snap = await getDoc(doc(db, 'userProfiles', u.uid));
        if (snap.exists()) {
          const profile = snap.data();
          const famSnap = await getDoc(doc(db, 'families', profile.familyId));
          setFamily(famSnap.exists() ? { id: famSnap.id, ...famSnap.data() } : null);
        }
      } else {
        setFamily(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Google sign-in
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  // Phone sign-in — step 1: send OTP
  const sendOTP = async (phoneNumber, recaptchaContainerId) => {
    const recaptcha = new RecaptchaVerifier(auth, recaptchaContainerId, { size: 'invisible' });
    const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptcha);
    return confirmation; // call confirmation.confirm(otp) in step 2
  };

  // Link user to a family after first login
  const linkToFamily = async (familyId) => {
    await setDoc(doc(db, 'userProfiles', user.uid), { familyId, linkedAt: new Date() });
    const famSnap = await getDoc(doc(db, 'families', familyId));
    setFamily({ id: famSnap.id, ...famSnap.data() });
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, family, loading, loginWithGoogle, sendOTP, linkToFamily, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
