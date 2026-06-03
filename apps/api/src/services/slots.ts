import { db } from '../lib/firebase';
import { COLLECTIONS, slotConverter } from '@ada/shared/firestore';
import { SlotSchema } from '@ada/shared/schemas';
import type { Slot } from '@ada/shared/types';
import { generateId } from '../lib/id';
import { AppError } from '../lib/errors';
import { generateSnippet } from '../lib/snippet';
import { pushSlotCache } from '../lib/push-cache';

export async function createSlot(input: {
  publisherId: string;
  name: string;
  sizes: any[];
  pricing: any;
  placement: any;
}): Promise<Slot> {
  const id = generateId('slot');
  const slotData = {
    id,
    publisherId: input.publisherId,
    name: input.name,
    sizes: input.sizes,
    pricing: input.pricing,
    placement: input.placement,
    status: 'active' as const,
  };

  const validated = SlotSchema.parse(slotData);

  await db
    .collection(COLLECTIONS.slots)
    .doc(id)
    .withConverter(slotConverter)
    .set(validated);

  if (process.env.UPSTASH_REDIS_REST_URL) {
    await pushSlotCache(id);
  }

  return validated;
}

export async function getSlot(id: string): Promise<Slot | null> {
  const doc = await db
    .collection(COLLECTIONS.slots)
    .doc(id)
    .withConverter(slotConverter)
    .get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() || null;
}

export async function listSlotsForPublisher(publisherId: string): Promise<Slot[]> {
  const snapshot = await db
    .collection(COLLECTIONS.slots)
    .where('publisherId', '==', publisherId)
    .withConverter(slotConverter)
    .get();

  return snapshot.docs.map(doc => doc.data());
}

export async function updateSlot(
  id: string,
  updates: Partial<Omit<Slot, 'id' | 'publisherId'>>
): Promise<Slot> {
  const slotRef = db
    .collection(COLLECTIONS.slots)
    .doc(id)
    .withConverter(slotConverter);

  const doc = await slotRef.get();
  if (!doc.exists) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }

  const current = doc.data()!;
  
  const merged = {
    ...current,
    ...updates,
    pricing: updates.pricing ? { ...current.pricing, ...updates.pricing } : current.pricing,
    placement: updates.placement ? { ...current.placement, ...updates.placement } : current.placement,
  };

  const validated = SlotSchema.parse(merged);

  await slotRef.set(validated);

  if (process.env.UPSTASH_REDIS_REST_URL) {
    await pushSlotCache(id);
  }

  return validated;
}

export async function getSnippetForSlot(
  id: string,
  options?: { width?: number; height?: number }
): Promise<string> {
  const slot = await getSlot(id);
  if (!slot) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }

  let width = options?.width;
  let height = options?.height;

  if (width != null && height != null) {
    const isSupported = slot.sizes.some(s => s.width === width && s.height === height);
    if (!isSupported) {
      throw new AppError(
        400,
        `Dimensions ${width}x${height} are not supported by slot ${id}`,
        'BAD_REQUEST'
      );
    }
  } else {
    const defaultSize = slot.sizes[0];
    if (!defaultSize) {
      throw new AppError(500, `Slot ${id} has no sizes configured`, 'INTERNAL_SERVER_ERROR');
    }
    width = defaultSize.width;
    height = defaultSize.height;
  }

  return generateSnippet({
    slotId: slot.id,
    width,
    height,
  });
}
