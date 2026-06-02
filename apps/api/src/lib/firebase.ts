import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

function init() {
  if (getApps().length > 0) return;

  const useEmulator = process.env.FIRESTORE_EMULATOR_HOST != null;

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
    initializeApp({ credential: applicationDefault() });
  }
}

init();

export const db = getFirestore();
export const auth = getAuth();
export const storage = getStorage();
