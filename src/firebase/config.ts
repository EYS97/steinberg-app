import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCYJBKmEwSTIsokBZlc26qPFin14uJqNxE',
  authDomain: 'steinberg-family-c0c32.firebaseapp.com',
  projectId: 'steinberg-family-c0c32',
  storageBucket: 'steinberg-family-c0c32.firebasestorage.app',
  messagingSenderId: '782902361877',
  appId: '1:782902361877:web:8230d223bb517c73bff31c',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
