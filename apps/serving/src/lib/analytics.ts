import { getRedis } from './redis.js';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_ACCRUAL } from '@ada/shared';

export interface AdEvent {
  type: 'impression' | 'click' | 'pageview' | 'slot_load';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  advertiserId: string;
  country: string;
  visitorToken: string;
  ts: number;
}

/** The creativeId component used when signing a page-level pixel — no creative is
 * involved, so the ad-serve signature namespace needs a stand-in constant that the
 * route (pageview.ts) and its signer (ad.ts) agree on. */
export const PAGEVIEW_CREATIVE_ID = 'pageview';

export const EVENT_COUNTER_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Hour bucket (UTC) an event belongs to, keyed by the event's OWN ts so a
 * late drain still lands in the hour the event happened. Mirrored by the
 * aggregator's `recorded:{hour}` counter — the two are compared by the
 * daily reconciliation cron (2026-08-09 design, Part 3). */
export function emittedCounterKey(ts: number): string {
  const d = new Date(ts);
  const hk =
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    String(d.getUTCHours()).padStart(2, '0');
  return `emitted:${hk}`;
}

/**
 * Fan out each event to independent Redis lists. Stats aggregation and CPM accrual are
 * separate consumers with different cadences; sharing one list let whichever cron popped
 * first cannibalize the other's events (pageviews were dropped, impressions never reached
 * stats). Every event goes to the stats queue; only impressions go to the accrual queue
 * (accrual bills impressions only).
 *
 * Awaited (not fire-and-forget) so the write is durable: on Vercel's Node runtime the
 * instance can freeze right after the response is sent, before a detached write lands,
 * and the event vanishes with no error. All four commands (two possible lpush, the emitted
 * counter incr, and its expire) go through a SINGLE pipelined round trip — that's what
 * makes awaiting affordable on this latency-critical path (2026-08-09 design).
 */
export async function logEvent(ev: AdEvent): Promise<void> {
  const redis = getRedis();
  const payload = JSON.stringify(ev);
  const key = emittedCounterKey(ev.ts);
  const p = redis.pipeline();
  p.lpush(EVENT_QUEUE_STATS, payload);
  if (ev.type === 'impression') {
    p.lpush(EVENT_QUEUE_ACCRUAL, payload);
  }
  p.incr(key);
  p.expire(key, EVENT_COUNTER_TTL_SECONDS);
  await p.exec();
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
    // Treat null/undefined as 0 (fail-closed): a missing key means the budget counter
    // was never seeded or expired — don't serve until the next cron refresh restores it.
    const val = vals[i];
    out[id] = val != null ? Number(val) : 0;
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
