import { db } from '../lib/firebase';
import { COLLECTIONS, publisherConverter } from '@ada/shared/firestore';
import { PublisherSchema } from '@ada/shared/schemas';
import type { Publisher } from '@ada/shared/types';
import { generateId } from '../lib/id';
import { AppError } from '../lib/errors';

export async function createPublisher(input: {
  ownerEmail: string;
  domain: string;
  displayName: string;
  payoutMethod: any;
  contentPolicy: any;
}): Promise<Publisher> {
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
  };

  // Validate using Zod schema
  const validated = PublisherSchema.parse(publisherData);

  // Save to Firestore
  await db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .withConverter(publisherConverter)
    .set(validated);

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

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data();
}

export async function updatePublisher(
  id: string,
  updates: Partial<Omit<Publisher, 'id' | 'createdAt' | 'ownerEmail'>>
): Promise<Publisher> {
  const pubRef = db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .withConverter(publisherConverter);

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
