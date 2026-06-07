import { getRedis } from './redis.js';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_ACCRUAL } from '@ada/shared';

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

/**
 * Fan out each event to independent Redis lists. Stats aggregation and CPM accrual are
 * separate consumers with different cadences; sharing one list let whichever cron popped
 * first cannibalize the other's events (pageviews were dropped, impressions never reached
 * stats). Every event goes to the stats queue; only impressions go to the accrual queue
 * (accrual bills impressions only).
 */
export async function logEvent(ev: AdEvent): Promise<void> {
  const redis = getRedis();
  const payload = JSON.stringify(ev);
  await redis.lpush(EVENT_QUEUE_STATS, payload);
  if (ev.type === 'impression') {
    await redis.lpush(EVENT_QUEUE_ACCRUAL, payload);
  }
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
