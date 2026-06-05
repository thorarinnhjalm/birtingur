import { getRedis } from './redis.js';
import type { SlotCacheEntry } from '@ada/shared';

const key = (slotId: string) => `slot:${slotId}`;

// Serving only READS the slot cache. Cache writes/invalidation are owned by
// apps/api (`src/lib/push-cache.ts`), which has Firestore access.
export async function getSlotCache(slotId: string): Promise<SlotCacheEntry | null> {
  const raw = await getRedis().get<SlotCacheEntry>(key(slotId));
  return raw ?? null;
}
