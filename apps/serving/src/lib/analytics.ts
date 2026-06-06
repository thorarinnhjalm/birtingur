import { getRedis } from './redis.js';

export interface AdEvent {
  type: 'impression' | 'click' | 'pageview';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  advertiserId: string;
  country: string;
  visitorToken: string;
  ts: number;
}

const QUEUE = 'events:queue';

/**
 * Push event to a Redis list; aggregation cron consumes the list and writes
 * Firestore hourly stats and ledger entries in batches.
 */
export async function logEvent(ev: AdEvent): Promise<void> {
  await getRedis().lpush(QUEUE, JSON.stringify(ev));
}

/**
 * Decrement campaign budget counter in Redis after an impression that earns CPM.
 * Returns the new remaining budget (in ISK).
 */
export async function decrementBudget(campaignId: string, costIsk: number): Promise<number> {
  const key = `budget:${campaignId}`;
  const newVal = await getRedis().decrby(key, costIsk);
  return newVal;
}

export async function getRemainingBudgets(campaignIds: string[]): Promise<Record<string, number>> {
  if (campaignIds.length === 0) return {};
  const redis = getRedis();
  const vals = await redis.mget<(number | null)[]>(...campaignIds.map((id) => `budget:${id}`));
  const out: Record<string, number> = {};
  campaignIds.forEach((id, i) => {
    // Treat null/undefined as Infinity (not seeded yet)
    const val = vals[i];
    out[id] = val != null ? Number(val) : Number.POSITIVE_INFINITY;
  });
  return out;
}

export async function incrementPaceSpent(campaignId: string, costIsk: number): Promise<void> {
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC = Iceland)
  const key = `pace_spent:${campaignId}:${dayKey}`;
  const redis = getRedis();
  await redis.incrby(key, costIsk);
  await redis.expire(key, 2 * 86400);
}

export async function getPaceState(
  campaignIds: string[],
): Promise<Record<string, { limit: number; spent: number }>> {
  const out: Record<string, { limit: number; spent: number }> = {};
  if (campaignIds.length === 0) return out;
  const redis = getRedis();
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const limits = await redis.mget<(number | null)[]>(
    ...campaignIds.map((id) => `pace_limit:${id}`),
  );
  const spents = await redis.mget<(number | null)[]>(
    ...campaignIds.map((id) => `pace_spent:${id}:${dayKey}`),
  );
  campaignIds.forEach((id, i) => {
    out[id] = { limit: limits[i] ?? Number.POSITIVE_INFINITY, spent: spents[i] ?? 0 };
  });
  return out;
}
