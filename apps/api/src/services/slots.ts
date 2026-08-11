import { db } from '../lib/firebase.js';
import { COLLECTIONS, slotConverter } from '@ada/shared/firestore';
import { SlotSchema } from '@ada/shared/schemas';
import { FLAT_CPM_ISK, IAB_STANDARD_SIZES } from '@ada/shared';
import type { Slot } from '@ada/shared/types';
import { generateId } from '../lib/id.js';
import { AppError } from '../lib/errors.js';
import { generateSnippet } from '../lib/snippet.js';
import { pushSlotCache } from '../lib/push-cache.js';
import { isRedisConfigured } from '../lib/redis.js';
import { getPublisherById } from './publishers.js';
import { createNotification } from './notifications.js';

/**
 * The only pricing a slot can have.
 *
 * `PricingSchema` still models a `slot` (fixed price per period) mode so
 * legacy documents stay readable, but nothing has ever honoured it:
 * `services/accrual.ts` books every impression at `FLAT_CPM_ISK` no matter
 * what the slot says, and `slotPriceIsk` is read nowhere in the money flow.
 * Worse, serving used to gate its real-time budget decrement on
 * `pricing.mode === 'cpm'`, so a slot-priced slot let a campaign serve past
 * its budget until the 15-minute accrual cron caught up.
 *
 * Rather than keep a mode that costs money and buys nothing, writes are
 * pinned here: no new slot can be created or updated into `slot` mode.
 * Legacy docs keep parsing, and serving now charges them like everything
 * else.
 */
const FLAT_PRICING = { mode: 'cpm' as const, cpmIsk: FLAT_CPM_ISK };

const IAB_SIZE_KEYS = new Set(IAB_STANDARD_SIZES.map((s) => `${s.width}x${s.height}`));
const IAB_SIZE_LIST = IAB_STANDARD_SIZES.map((s) => `${s.width}x${s.height} (${s.name})`).join(
  ', ',
);

/**
 * Rejects sizes outside `IAB_STANDARD_SIZES`.
 *
 * Every client-facing surface already promises this set — the dashboard's
 * SlotCreate only offers those five, the MCP `create_slot` description says
 * "styður einungis", and the FAQ lists them — but nothing enforced it, so an
 * agent or a raw `ak_` key could mint a slot in a size no creative is ever
 * rendered at (`/generate/render` accepts IAB sizes only). Such a slot then
 * quietly serves nothing and gets filtered back out of the category size
 * forecast (`getCategorySizeForecast`). Legacy slots created before this
 * check are left alone: only writes that actually carry `sizes` are
 * validated, so a publisher can still rename or pause an old slot.
 */
function assertIabSizes(sizes: unknown): void {
  if (!Array.isArray(sizes)) return; // shape errors belong to SlotSchema
  for (const size of sizes) {
    const key = `${(size as { width?: unknown })?.width}x${(size as { height?: unknown })?.height}`;
    if (!IAB_SIZE_KEYS.has(key)) {
      throw new AppError(
        400,
        `Unsupported ad size ${key}. Supported sizes: ${IAB_SIZE_LIST}`,
        'INVALID_SIZE',
      );
    }
  }
}

export async function createSlot(input: {
  publisherId: string;
  name: string;
  sizes: any[];
  /** Accepted for backwards compatibility and ignored — see FLAT_PRICING. */
  pricing?: any;
  placement: any;
  fallbackType?: 'house_ad' | 'transparent';
}): Promise<Slot> {
  const id = generateId('slot');
  assertIabSizes(input.sizes);

  const slotData = {
    id,
    publisherId: input.publisherId,
    name: input.name,
    sizes: input.sizes,
    pricing: FLAT_PRICING,
    placement: input.placement || { pageMatcher: '/*', position: 'sidebar' as const },
    status: 'active' as const,
    fallbackType: input.fallbackType || 'house_ad',
  };

  const validated = SlotSchema.parse(slotData);

  await db.collection(COLLECTIONS.slots).doc(id).withConverter(slotConverter).set(validated);

  if (isRedisConfigured()) {
    await pushSlotCache(id);
  }

  try {
    const publisher = await getPublisherById(input.publisherId);
    if (publisher) {
      await createNotification({
        userEmail: publisher.ownerEmail,
        role: 'publisher',
        type: 'info',
        title: 'Auglýsingapláss skráð',
        message: `Nýja auglýsingaplássið þitt „${input.name}“ hefur verið skráð í kerfið.`,
        link: `/publisher/slots/${id}`,
      });
    }
  } catch (err) {
    console.error('Error creating slot notification:', err);
  }

  return validated;
}

export async function getSlot(id: string): Promise<Slot | null> {
  const doc = await db.collection(COLLECTIONS.slots).doc(id).withConverter(slotConverter).get();

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

  return snapshot.docs.map((doc) => doc.data());
}

export async function updateSlot(
  id: string,
  updates: Partial<Omit<Slot, 'id' | 'publisherId'>>,
): Promise<Slot> {
  const slotRef = db.collection(COLLECTIONS.slots).doc(id).withConverter(slotConverter);

  const doc = await slotRef.get();
  if (!doc.exists) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }

  if (updates.sizes !== undefined) {
    assertIabSizes(updates.sizes);
  }

  const current = doc.data()!;

  // A patch can never change pricing: any write pins the slot to the flat
  // CPM, which also migrates a legacy slot-priced doc the first time its
  // owner edits anything.
  const updatedPricing = FLAT_PRICING;

  const merged = {
    ...current,
    ...updates,
    pricing: updatedPricing,
    placement: updates.placement
      ? { ...current.placement, ...updates.placement }
      : current.placement,
  };

  const validated = SlotSchema.parse(merged);

  await slotRef.set(validated);

  if (isRedisConfigured()) {
    await pushSlotCache(id);
  }

  return validated;
}

export async function getSnippetForSlot(
  id: string,
  options?: { width?: number; height?: number },
): Promise<string> {
  const slot = await getSlot(id);
  if (!slot) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }

  let width = options?.width;
  let height = options?.height;

  if (width != null && height != null) {
    const isSupported = slot.sizes.some((s) => s.width === width && s.height === height);
    if (!isSupported) {
      throw new AppError(
        400,
        `Dimensions ${width}x${height} are not supported by slot ${id}`,
        'BAD_REQUEST',
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

export async function listAllSlots(): Promise<Slot[]> {
  const snapshot = await db.collection(COLLECTIONS.slots).withConverter(slotConverter).get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function updateSlotStatus(slotId: string, status: 'active' | 'paused'): Promise<Slot> {
  const slotRef = db.collection(COLLECTIONS.slots).doc(slotId).withConverter(slotConverter);
  const doc = await slotRef.get();
  if (!doc.exists) {
    throw new AppError(404, `Slot with ID ${slotId} not found`, 'NOT_FOUND');
  }

  const current = doc.data()!;
  const updated = SlotSchema.parse({ ...current, status });
  await slotRef.set(updated);

  if (isRedisConfigured()) {
    await pushSlotCache(slotId);
  }

  return updated;
}

export async function deleteSlot(id: string): Promise<void> {
  const slotRef = db.collection(COLLECTIONS.slots).doc(id).withConverter(slotConverter);
  const doc = await slotRef.get();
  if (!doc.exists) {
    throw new AppError(404, `Slot with ID ${id} not found`, 'NOT_FOUND');
  }
  await slotRef.delete();
  if (isRedisConfigured()) {
    await pushSlotCache(id);
  }
}
