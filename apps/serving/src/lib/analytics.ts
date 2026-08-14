import { getRedis } from './redis.js';
import {
  EVENT_QUEUE_STATS,
  EVENT_QUEUE_ACCRUAL,
  ctrCounterKey,
  CTR_COUNTER_TTL_SECONDS,
} from '@ada/shared';
import type { BotClass } from './bot-class.js';

export interface AdEvent {
  // DELIBERATELY no separate 'slot_load' wire type here. A slot load (one per
  // /v1/ad request) and a true page view (one per page load, see
  // routes/pageview.ts) share the SAME wire type 'pageview' — the only
  // discriminator is `creativeId`: a true page view carries
  // creativeId === PAGEVIEW_CREATIVE_ID, a slot load carries the real (or
  // fallback) creativeId of whatever was served.
  //
  // This is a deploy-order-safety decision, not an oversight. apps/serving and
  // apps/api are separate Vercel projects that rebuild simultaneously on one
  // push, so "serving live before api" (or vice versa) is a real, uncontrollable
  // window. An earlier version of this branch renamed slot-load events to a
  // 'slot_load' wire type; a 'slot_load' event drained by main's OLD aggregator
  // (which only special-cases 'pageview', then buckets everything else as an
  // impression/click) would have been counted as a CLICK — inflating publisher
  // CTR, campaign byPublisher clicks and creative clicks, irreversibly. Keeping
  // the wire type constant and using `creativeId` as the discriminator means
  // either deploy order is safe: an old aggregator counts every 'pageview'
  // event (slot loads included) as a pageview — bounded, harmless overcounting,
  // never a click — and the new aggregator (apps/api/src/services/
  // stats-aggregator.ts) already routes on the creativeId marker. See
  // docs/superpowers/specs/2026-08-09-traffic-measurement-integrity-design.md.
  //
  // Do not reintroduce a distinct 'slot_load' wire type here. apps/api's
  // aggregator still accepts one defensively (forward/backward compat), but
  // apps/serving must never emit it.
  type: 'impression' | 'click' | 'pageview';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  advertiserId: string;
  country: string;
  visitorToken: string;
  ts: number;
  // Stamped by serving (classifyRequest, lib/bot-class.ts) on every event —
  // required here because the producer always classifies. CONSUMERS must
  // treat this field's ABSENCE as "unclassified", never as 'human': events
  // already sitting in the Redis queue when a deploy lands were written by
  // the old shape and carry no botClass at all, and apps/api (the consumer)
  // deploys independently of apps/serving (the producer).
  botClass: BotClass;
}

/** The creativeId component used when signing a page-level pixel — no creative is
 * involved, so the ad-serve signature namespace needs a stand-in constant that the
 * route (pageview.ts) and its signer (ad.ts) agree on. This value doubles as the
 * discriminator described on `AdEvent.type` above: any 'pageview' event carrying
 * this exact creativeId is a true page view; any other creativeId means a slot
 * load. */
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

  const banditField = ctrCounterField(ev);
  if (banditField) {
    // Rides the SAME pipeline as everything above, so the creative bandit's
    // evidence costs zero extra round trips on the hot path. Read back by
    // apps/api's push-cache when it rebuilds a slot's cache entry.
    const ctrKey = ctrCounterKey(ev.campaignId, ev.creativeId);
    p.hincrby(ctrKey, banditField, 1);
    p.expire(ctrKey, CTR_COUNTER_TTL_SECONDS);
  }

  await p.exec();
}

/**
 * Which CTR counter field this event feeds, or null if it feeds none.
 *
 * The counters exist for ONE purpose: comparing the creative variants of a real
 * campaign against each other. Three kinds of event are therefore excluded, and
 * each exclusion is load-bearing:
 *
 *   - 'pageview' is also the wire type for slot loads (see AdEvent.type above),
 *     which are ads served but not necessarily seen. Counting those as
 *     impressions would inflate the denominator unevenly across variants.
 *   - Non-human traffic would otherwise let a crawler pick which ad Icelandic
 *     readers get shown. Bot events still go to the stats queue above — they are
 *     excluded from the bandit, not dropped.
 *   - Fallback house ads / transparent placeholders share the synthetic
 *     'cmp_fallback' campaign and are not variants of anything.
 */
function ctrCounterField(ev: AdEvent): 'imp' | 'clk' | null {
  if (ev.type !== 'impression' && ev.type !== 'click') return null;
  if (ev.botClass !== 'human') return null;
  if (ev.campaignId === 'cmp_fallback' || !ev.campaignId) return null;
  if (ev.creativeId.startsWith('cre_fallback_') || !ev.creativeId) return null;
  return ev.type === 'impression' ? 'imp' : 'clk';
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
