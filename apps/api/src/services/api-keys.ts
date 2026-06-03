import { randomBytes, createHash } from 'crypto';
import { db } from '../lib/firebase.js';

const KEY_COLLECTION = 'api_keys';

export interface ApiKeyRecord {
  id: string;
  ownerEmail: string;
  hash: string; // sha256 of full key
  scope: 'advertiser' | 'publisher' | 'both';
  createdAt: Date;
  lastUsedAt?: Date;
  revoked: boolean;
}

function hash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function issueApiKey(
  ownerEmail: string,
  scope: 'advertiser' | 'publisher' | 'both',
): Promise<{ id: string; key: string }> {
  const id = `ak_${randomBytes(8).toString('hex')}`;
  const secret = randomBytes(24).toString('hex');
  const key = `${id}_${secret}`;
  const record: ApiKeyRecord = {
    id,
    ownerEmail,
    hash: hash(key),
    scope,
    createdAt: new Date(),
    revoked: false,
  };
  await db.collection(KEY_COLLECTION).doc(id).set(record);
  return { id, key };
}

export async function verifyApiKey(key: string): Promise<ApiKeyRecord | null> {
  const idMatch = key.match(/^ak_[a-f0-9]{16}/);
  if (!idMatch) return null;
  const id = idMatch[0];
  const snap = await db.collection(KEY_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const record = snap.data() as ApiKeyRecord;
  if (record.revoked) return null;

  // Handle Firestore Date conversion
  const recordHash = record.hash;
  if (recordHash !== hash(key)) return null;

  // Update lastUsedAt asynchronously
  db.collection(KEY_COLLECTION)
    .doc(id)
    .update({ lastUsedAt: new Date() })
    .catch(() => {});

  return record;
}

export async function revokeApiKey(id: string): Promise<void> {
  await db.collection(KEY_COLLECTION).doc(id).update({ revoked: true });
}
