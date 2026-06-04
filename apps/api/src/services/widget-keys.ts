import { randomBytes } from 'crypto';
import { db } from '../lib/firebase.js';

const WIDGET_KEY_COLLECTION = 'widget_keys';

export interface WidgetKeyRecord {
  id: string;
  key: string;
  ownerEmail: string;
  type: 'publisher' | 'campaign';
  targetId: string;
  createdAt: Date;
  lastUsedAt?: Date;
  revoked: boolean;
}

export async function issueWidgetKey(
  ownerEmail: string,
  type: 'publisher' | 'campaign',
  targetId: string,
): Promise<WidgetKeyRecord> {
  const id = `wk_${type}_${randomBytes(8).toString('hex')}`;
  const secret = randomBytes(24).toString('hex');
  const key = `${id}_${secret}`;

  const record: WidgetKeyRecord = {
    id,
    key,
    ownerEmail,
    type,
    targetId,
    createdAt: new Date(),
    revoked: false,
  };

  await db.collection(WIDGET_KEY_COLLECTION).doc(id).set(record);
  return record;
}

export async function verifyWidgetKey(key: string): Promise<WidgetKeyRecord | null> {
  // Bypass validation for demo/local testing in development/emulator mode
  const isDevOrEmulator =
    process.env.FIRESTORE_EMULATOR_HOST != null || process.env.NODE_ENV === 'development';
  if (
    isDevOrEmulator &&
    (key === 'wk_publisher_demo_mock_key' || key === 'wk_campaign_demo_mock_key')
  ) {
    return {
      id: key,
      key: key,
      ownerEmail: 'demoa@birtingur.is',
      type: key.includes('publisher') ? 'publisher' : 'campaign',
      targetId: key.includes('publisher') ? 'pub_demo_id' : 'camp_demo_id',
      createdAt: new Date(),
      revoked: false,
    };
  }

  // Extract key ID
  const match = key.match(/^(wk_(?:publisher|campaign)_[a-f0-9]{16})_[a-f0-9]{48}$/);
  if (!match) return null;
  const id = match[1]!;

  const snap = await db.collection(WIDGET_KEY_COLLECTION).doc(id).get();
  if (!snap.exists) return null;

  const record = snap.data() as WidgetKeyRecord;
  if (!record || record.revoked || record.key !== key) return null;

  // Convert Firestore dates to JS Dates
  if (record.createdAt) record.createdAt = new Date((record.createdAt as any).seconds * 1000);
  if (record.lastUsedAt) record.lastUsedAt = new Date((record.lastUsedAt as any).seconds * 1000);

  // Update lastUsedAt asynchronously
  db.collection(WIDGET_KEY_COLLECTION)
    .doc(id)
    .update({ lastUsedAt: new Date() })
    .catch(() => {});

  return record;
}

export async function revokeWidgetKey(id: string): Promise<void> {
  await db.collection(WIDGET_KEY_COLLECTION).doc(id).update({ revoked: true });
}

export async function getWidgetKeyByTargetId(
  targetId: string,
  type: 'publisher' | 'campaign',
): Promise<WidgetKeyRecord | null> {
  const snap = await db
    .collection(WIDGET_KEY_COLLECTION)
    .where('targetId', '==', targetId)
    .where('type', '==', type)
    .where('revoked', '==', false)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const record = snap.docs[0]!.data() as WidgetKeyRecord;

  if (record.createdAt) record.createdAt = new Date((record.createdAt as any).seconds * 1000);
  if (record.lastUsedAt) record.lastUsedAt = new Date((record.lastUsedAt as any).seconds * 1000);

  return record;
}

export async function getOrCreateWidgetKey(
  ownerEmail: string,
  type: 'publisher' | 'campaign',
  targetId: string,
): Promise<WidgetKeyRecord> {
  const existing = await getWidgetKeyByTargetId(targetId, type);
  if (existing) return existing;
  return issueWidgetKey(ownerEmail, type, targetId);
}
