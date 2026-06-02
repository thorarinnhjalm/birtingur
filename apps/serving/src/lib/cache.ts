import { getRedis } from './redis';
import { CACHE_TTL_SECONDS } from '@ada/shared';

export interface CachedCreative {
  creativeId: string;
  campaignId: string;
  imageUrl: string;
  clickUrl: string;
  width: number;
  height: number;
  weight: number;
  geoCountries?: string[];
  geoRegions?: string[];
  frequencyCapPerDay: number;
  budgetExhausted: boolean;
  validFrom: number; // ms epoch
  validTo: number; // ms epoch
  priority: 'slot_purchased' | 'cpm';
}

export interface SlotCacheEntry {
  slotId: string;
  publisherId: string;
  sizes: Array<{ width: number; height: number }>;
  pricing:
    | { mode: 'cpm'; cpmIsk: number }
    | { mode: 'slot'; slotPriceIsk: number; slotPeriodDays: number };
  activeCreatives: CachedCreative[];
  blockedCategories: string[];
  refreshedAt: number;
}

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
