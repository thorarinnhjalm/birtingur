import { getRedis } from './redis';
import { CACHE_TTL_SECONDS } from '@ada/shared';
import type { SlotCacheEntry } from '@ada/shared';

const key = (slotId: string) => `slot:${slotId}`;

export async function getSlotCache(slotId: string): Promise<SlotCacheEntry | null> {
  const raw = await getRedis().get<SlotCacheEntry>(key(slotId));
  return raw ?? null;
}

export async function pushSlotCache(entry: SlotCacheEntry): Promise<void> {
  await getRedis().set(key(entry.slotId), entry, { ex: CACHE_TTL_SECONDS });
}

export async function invalidateSlot(slotId: string): Promise<void> {
  await getRedis().del(key(slotId));
}
