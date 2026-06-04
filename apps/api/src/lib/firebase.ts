import './env.js';
import { initializeApp, getApps, getApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

function init() {
  if (getApps().length > 0) return;

  const useEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

  if (useEmulator) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'ada-test' });
    return;
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (privateKey && clientEmail && projectId) {
    initializeApp({
      credential: cert({ privateKey, clientEmail, projectId }),
      projectId,
      storageBucket: `${projectId}.appspot.com`,
    });
  } else {
    // If we're on Vercel or in production, NEVER fallback to applicationDefault() because it hangs trying to contact GCP metadata server.
    // Instead, throw a descriptive initialization error.
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      throw new Error(
        `Firebase Admin SDK initialization failed: Missing environment variables. ` +
          `Ensure FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and FIREBASE_PROJECT_ID are configured in Vercel settings. ` +
          `Received: projectId=${projectId}, clientEmail=${clientEmail}, privateKeyLength=${privateKey ? privateKey.length : 0}`,
      );
    }

    const fallbackProjectId =
      process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'ada-dev';
    initializeApp({
      credential: applicationDefault(),
      projectId: fallbackProjectId,
      storageBucket: `${fallbackProjectId}.appspot.com`,
    });
  }
}

init();

const databaseId = process.env.FIREBASE_DATABASE_ID;
export const db = databaseId ? getFirestore(getApp(), databaseId) : getFirestore();
export const auth = getAuth();
export const storage = getStorage();
