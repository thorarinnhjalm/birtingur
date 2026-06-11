import { db } from '../lib/firebase.js';
import { COLLECTIONS, publisherConverter } from '@ada/shared/firestore';
import { PublisherSchema } from '@ada/shared/schemas';
import type { Publisher } from '@ada/shared/types';
import { SENSITIVE_AD_CATEGORY_SLUGS } from '@ada/shared';
import { generateId } from '../lib/id.js';
import { AppError } from '../lib/errors.js';
import { sendWelcomePublisherEmail } from './mail.js';
import { createNotification } from './notifications.js';

function assertValidBlockedCategories(contentPolicy?: { blockedCategories?: string[] }): void {
  const blocked = contentPolicy?.blockedCategories;
  if (!blocked) return;
  const invalid = blocked.filter((c) => !SENSITIVE_AD_CATEGORY_SLUGS.includes(c));
  if (invalid.length > 0) {
    throw new AppError(400, `Invalid blocked categories: ${invalid.join(', ')}`, 'BAD_REQUEST');
  }
}

export async function createPublisher(input: {
  ownerEmail: string;
  domain: string;
  displayName: string;
  payoutMethod: any;
  contentPolicy: any;
  integrationPreference?: 'widget' | 'mcp' | 'both';
  estimatedSlotsCount?: number;
  categories: string[];
}): Promise<Publisher> {
  assertValidBlockedCategories(input.contentPolicy);
  const id = generateId('pub');
  const publisherData = {
    id,
    ownerEmail: input.ownerEmail,
    domain: input.domain,
    displayName: input.displayName,
    payoutMethod: input.payoutMethod,
    contentPolicy: input.contentPolicy,
    status: 'active' as const,
    createdAt: new Date(),
    integrationPreference: input.integrationPreference ?? 'widget',
    estimatedSlotsCount: input.estimatedSlotsCount,
    categories: input.categories,
  };

  // Validate using Zod schema
  const validated = PublisherSchema.parse(publisherData);

  // Save to Firestore
  await db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .withConverter(publisherConverter)
    .set(validated);

  // Send welcome email asynchronously so it doesn't block API response
  sendWelcomePublisherEmail(validated.ownerEmail, validated.displayName, validated.domain).catch(
    (err) => console.error('Error sending welcome email to publisher:', err),
  );

  try {
    await createNotification({
      userEmail: validated.ownerEmail,
      role: 'publisher',
      type: 'success',
      title: 'Velkomin/n í Birting!',
      message:
        'Útgefendaaðgangurinn þinn hefur verið stofnaður. Búðu til þitt fyrsta auglýsingapláss.',
      link: '/publisher/slots/new',
    });
  } catch (err) {
    console.error('Error creating welcome publisher notification:', err);
  }

  return validated;
}

export async function getPublisherById(id: string): Promise<Publisher | null> {
  const doc = await db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .withConverter(publisherConverter)
    .get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() || null;
}

export async function getPublisherByOwnerEmail(email: string): Promise<Publisher | null> {
  const snapshot = await db
    .collection(COLLECTIONS.publishers)
    .where('ownerEmail', '==', email)
    .limit(1)
    .withConverter(publisherConverter)
    .get();

  const firstDoc = snapshot.docs[0];
  if (!firstDoc) {
    return null;
  }

  return firstDoc.data();
}

export async function getPublishersByOwnerEmail(email: string): Promise<Publisher[]> {
  const snapshot = await db
    .collection(COLLECTIONS.publishers)
    .where('ownerEmail', '==', email)
    .withConverter(publisherConverter)
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

export async function getPublisherByDomain(domain: string): Promise<Publisher | null> {
  const snapshot = await db
    .collection(COLLECTIONS.publishers)
    .where('domain', '==', domain.toLowerCase())
    .limit(1)
    .withConverter(publisherConverter)
    .get();

  const firstDoc = snapshot.docs[0];
  if (!firstDoc) {
    return null;
  }

  return firstDoc.data();
}

export async function updatePublisher(
  id: string,
  updates: Partial<Omit<Publisher, 'id' | 'createdAt' | 'ownerEmail'>>,
): Promise<Publisher> {
  assertValidBlockedCategories(updates.contentPolicy);
  const pubRef = db.collection(COLLECTIONS.publishers).doc(id).withConverter(publisherConverter);

  const doc = await pubRef.get();
  if (!doc.exists) {
    throw new AppError(404, `Publisher with ID ${id} not found`, 'NOT_FOUND');
  }

  const current = doc.data()!;

  // Merge current and updates
  const merged = {
    ...current,
    ...updates,
    payoutMethod: updates.payoutMethod
      ? { ...current.payoutMethod, ...updates.payoutMethod }
      : current.payoutMethod,
    contentPolicy: updates.contentPolicy
      ? { ...current.contentPolicy, ...updates.contentPolicy }
      : current.contentPolicy,
  };

  // Validate merged schema
  const validated = PublisherSchema.parse(merged);

  await pubRef.set(validated);

  return validated;
}

export async function updatePublisherStatus(
  publisherId: string,
  status: 'active' | 'suspended',
): Promise<Publisher> {
  const pubRef = db
    .collection(COLLECTIONS.publishers)
    .doc(publisherId)
    .withConverter(publisherConverter);
  const doc = await pubRef.get();
  if (!doc.exists) {
    throw new AppError(404, `Publisher with ID ${publisherId} not found`, 'NOT_FOUND');
  }

  const current = doc.data()!;
  const updated = PublisherSchema.parse({ ...current, status });
  await pubRef.set(updated);

  // Invalidate slot cache for all slots owned by this publisher
  const slotsSnap = await db
    .collection(COLLECTIONS.slots)
    .where('publisherId', '==', publisherId)
    .get();

  const { pushSlotCache } = await import('../lib/push-cache.js');
  for (const slotDoc of slotsSnap.docs) {
    await pushSlotCache(slotDoc.id);
  }

  return updated;
}

export async function deletePublisher(publisherId: string): Promise<void> {
  const pubRef = db
    .collection(COLLECTIONS.publishers)
    .doc(publisherId)
    .withConverter(publisherConverter);
  const doc = await pubRef.get();
  if (!doc.exists) {
    throw new AppError(404, `Publisher with ID ${publisherId} not found`, 'NOT_FOUND');
  }

  // 1. Delete all slots for this publisher and clear their caches
  const slotsSnap = await db
    .collection(COLLECTIONS.slots)
    .where('publisherId', '==', publisherId)
    .get();

  const { pushSlotCache } = await import('../lib/push-cache.js');
  const { isRedisConfigured } = await import('../lib/redis.js');

  for (const slotDoc of slotsSnap.docs) {
    await db.collection(COLLECTIONS.slots).doc(slotDoc.id).delete();
    if (isRedisConfigured()) {
      await pushSlotCache(slotDoc.id);
    }
  }

  // 2. Delete all payouts for this publisher
  const payoutsSnap = await db
    .collection(COLLECTIONS.payouts)
    .where('publisherId', '==', publisherId)
    .get();
  for (const payoutDoc of payoutsSnap.docs) {
    await db.collection(COLLECTIONS.payouts).doc(payoutDoc.id).delete();
  }

  // 3. Delete the publisher itself
  await pubRef.delete();
}
