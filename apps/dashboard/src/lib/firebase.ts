import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'mock-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'mock-auth-domain.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'mock-project-id',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'mock-project-id.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:mockappid',
};

// Prevent duplicate initialization during fast-refresh
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(firebaseApp);

// Opt-in Auth-emulator wiring for the e2e suite (playwright.config.ts sets
// the flag on its dev server): without it the sign-in flow always talks to
// production Firebase and no test account can ever exist.
if (import.meta.env.VITE_AUTH_EMULATOR === '1') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
}
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(firebaseApp);
