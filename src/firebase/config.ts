import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: 'AIzaSyCYJBKmEwSTIsokBZlc26qPFin14uJqNxE',
  authDomain: 'steinberg-family-c0c32.firebaseapp.com',
  projectId: 'steinberg-family-c0c32',
  storageBucket: 'steinberg-family-c0c32.firebasestorage.app',
  messagingSenderId: '782902361877',
  appId: '1:782902361877:web:8230d223bb517c73bff31c',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// ── App Check (anti-abuse) ────────────────────────────────────────────────
// Adds a reCAPTCHA-v3 attestation token to every Firestore/Auth request so the
// public Firebase config can't be driven by arbitrary scripts/bots.
//
// Activation is gated on VITE_RECAPTCHA_SITE_KEY: until you register a key and
// set it, this block is a no-op (so deploying now changes nothing). Once the key
// is set AND enforcement is turned on in the Firebase console, only attested
// app instances can reach Firestore. See README / setup notes for the steps.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
if (recaptchaSiteKey) {
  // Local dev: allow a debug token (register it in the App Check console once).
  if (import.meta.env.DEV) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Never let App Check init break app startup.
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
