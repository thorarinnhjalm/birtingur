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
