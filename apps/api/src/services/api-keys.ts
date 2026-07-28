import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import { db } from '../lib/firebase.js';
import { AppError } from '../lib/errors.js';

const KEY_COLLECTION = 'api_keys';

// Opt-in agentic-purchase capability for an `ak_` key. Absent entirely (or
// `enabled: false`) means the key can never create a campaign — see the
// purchase gate in services/campaigns.ts. There is deliberately no default
// cap/limit: enabling purchase requires the owner to state both numbers
// explicitly (fail-closed), see updateApiKeyPurchase below.
export interface ApiKeyPurchaseConfig {
  enabled: boolean;
  monthlyCapIsk: number;
  autoApproveLimitIsk: number;
}

export interface ApiKeyRecord {
  id: string;
  ownerEmail: string;
  hash: string; // sha256 of full key
  scope: 'advertiser' | 'publisher' | 'both';
  createdAt: Date;
  lastUsedAt?: Date;
  revoked: boolean;
  purchase?: ApiKeyPurchaseConfig;
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

export async function getApiKeyRecord(id: string): Promise<ApiKeyRecord | null> {
  const snap = await db.collection(KEY_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as ApiKeyRecord;
}

export async function revokeApiKey(id: string): Promise<void> {
  await db.collection(KEY_COLLECTION).doc(id).update({ revoked: true });
}

export async function listApiKeys(ownerEmail: string): Promise<Omit<ApiKeyRecord, 'hash'>[]> {
  const snap = await db.collection(KEY_COLLECTION).where('ownerEmail', '==', ownerEmail).get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    delete data.hash;
    return {
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      lastUsedAt: data.lastUsedAt?.toDate
        ? data.lastUsedAt.toDate()
        : data.lastUsedAt
          ? new Date(data.lastUsedAt)
          : undefined,
    } as any;
  });
}

const ApiKeyPurchaseConfigSchema = z
  .object({
    enabled: z.boolean(),
    monthlyCapIsk: z.number().int().min(0),
    autoApproveLimitIsk: z.number().int().min(0),
  })
  .refine((cfg) => cfg.autoApproveLimitIsk <= cfg.monthlyCapIsk, {
    message: 'autoApproveLimitIsk cannot exceed monthlyCapIsk',
  });

/**
 * Owner-driven update of a key's purchase capability. No defaults: turning
 * `enabled: true` on requires the caller to state both monthlyCapIsk and
 * autoApproveLimitIsk in the same call (the schema requires all three
 * fields), so a key can never end up "enabled" with an implicit unlimited
 * cap. `ownerEmail` scopes the update to keys actually owned by the caller.
 */
export async function updateApiKeyPurchase(
  id: string,
  ownerEmail: string,
  cfg: ApiKeyPurchaseConfig,
): Promise<ApiKeyRecord> {
  const parsed = ApiKeyPurchaseConfigSchema.parse(cfg);

  const record = await getApiKeyRecord(id);
  if (!record) {
    throw new AppError(404, `API key ${id} not found`, 'NOT_FOUND');
  }
  if (record.ownerEmail.toLowerCase() !== ownerEmail.toLowerCase()) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  if (record.scope === 'publisher') {
    throw new AppError(
      400,
      'Purchase capability only applies to advertiser or both-scoped keys',
      'BAD_REQUEST',
    );
  }

  const updated: ApiKeyRecord = { ...record, purchase: parsed };
  await db.collection(KEY_COLLECTION).doc(id).update({ purchase: parsed });
  return updated;
}
