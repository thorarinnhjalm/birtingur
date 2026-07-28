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

  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    } else if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  // Firebase projects created since ~2024 get `<id>.firebasestorage.app` as the
  // default bucket, not the legacy `<id>.appspot.com` (which does not exist for
  // them — writes 404 "The specified bucket does not exist"). FIREBASE_STORAGE_BUCKET
  // overrides for projects that do use the legacy name.
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${projectId}.firebasestorage.app`;

  if (privateKey && clientEmail && projectId) {
    initializeApp({
      credential: cert({ privateKey, clientEmail, projectId }),
      projectId,
      storageBucket,
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
      storageBucket:
        process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${fallbackProjectId}.firebasestorage.app`,
    });
  }
}

init();

const databaseId = process.env.FIREBASE_DATABASE_ID;
export const db = databaseId ? getFirestore(getApp(), databaseId) : getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth();
export const storage = getStorage();
