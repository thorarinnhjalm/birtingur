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
