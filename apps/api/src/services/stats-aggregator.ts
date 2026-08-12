import { COLLECTIONS } from '@ada/shared/firestore';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_LEGACY, FLAT_CPM_ISK } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { getRedis } from '../lib/redis.js';
import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentData, DocumentReference, SetOptions } from 'firebase-admin/firestore';

export interface QueuedEvent {
  type: 'impression' | 'click' | 'pageview' | 'slot_load';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  advertiserId: string;
  country: string;
  visitorToken: string;
  ts: number;
  // OPTIONAL, deliberately — not the AdEvent.botClass shape apps/serving emits (which is
  // required there). apps/serving and apps/api are separate Vercel projects that rebuild
  // simultaneously on one push; events already sitting in the Redis queue when a deploy
  // lands were written by the old shape and carry no botClass at all. Its ABSENCE means
  // "unclassified" and must count in NO class below — never default it to 'human', or the
  // first hours of post-deploy data would misreport 100% human traffic.
  botClass?: 'human' | 'known_bot' | 'suspected_bot';
}

function hourKey(ts: number): string {
  const d = new Date(ts);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    String(d.getUTCHours()).padStart(2, '0')
  );
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

// Mirrors serving's `emittedCounterKey` (apps/serving/src/lib/analytics.ts) — same
// `recorded:${YYYYMMDDHH}` (UTC) key shape and 7-day TTL, duplicated here rather than
// imported across the app boundary. The daily reconciliation cron compares the two
// counters per hour (2026-08-09 design, Part 3).
const RECORDED_COUNTER_TTL_SECONDS = 7 * 24 * 60 * 60;

function recordedCounterKey(ts: number): string {
  return `recorded:${hourKey(ts)}`;
}

// Builds the nested-object form of a byBotClass increment: { human: { impressions:
// FieldValue.increment(2) }, ... }. Per the dot-path regression note above the batch
// below, this MUST stay a nested object literal — never a dotted field-path string —
// or `batch.set(ref, data, { merge: true })` writes a literal flat field nobody reads.
function byBotClassIncrement(
  byBotClass: Record<string, { impressions?: number; pageViewsTrue?: number }>,
): Record<string, Record<string, ReturnType<typeof FieldValue.increment>>> {
  return Object.fromEntries(
    Object.entries(byBotClass).map(([cls, counts]) => [
      cls,
      Object.fromEntries(
        Object.entries(counts).map(([k, v]) => [k, FieldValue.increment(v as number)]),
      ),
    ]),
  );
}

// Primary wire contract (2026-08-09 design, revised after a deploy-order hazard
// was caught in review): a slot load (one per /v1/ad request) and a true page
// view (one per page load, apps/serving/src/routes/pageview.ts) DELIBERATELY
// share the same wire type 'pageview' — the ONLY discriminator is creativeId. A
// true page view carries creativeId === TRUE_PAGEVIEW_CREATIVE_ID; a slot load
// carries the real (or fallback) creativeId of whatever was served
// (`cre_…`, `cre_fallback_transparent`, `cre_fallback_birtingur`, `cre_nocache`).
//
// An earlier version of this branch instead renamed slot-load events to a
// separate 'slot_load' wire type. That was reverted: apps/serving and apps/api
// are separate Vercel projects that rebuild simultaneously on one push, so
// "serving live before api" (or the reverse) is a real, uncontrollable window.
// A 'slot_load' event drained by main's OLD aggregator — which only
// special-cases 'pageview' and buckets everything else as an impression/click —
// would have been counted as a CLICK, inflating publisher CTR and campaign/
// creative click totals irreversibly. Keeping the wire type constant means an
// old aggregator instead counts every 'pageview' event (slot loads included) as
// a pageview: bounded, harmless overcounting, never a click. Either deploy
// order is safe.
//
// Duplicated from serving's PAGEVIEW_CREATIVE_ID (apps/serving/src/lib/
// analytics.ts) rather than imported across the app boundary.
const TRUE_PAGEVIEW_CREATIVE_ID = 'pageview';

/** Max operations per Firestore batched write. */
const FIRESTORE_BATCH_LIMIT = 500;
/** Leaves headroom under the cap so a late addition can never straddle it. */
const BATCH_COMMIT_AT = FIRESTORE_BATCH_LIMIT - 50;

/**
 * A `db.batch()` stand-in that commits itself every `BATCH_COMMIT_AT`
 * operations, so the write phase is not silently bounded by Firestore's
 * 500-op limit.
 */
function chunkedBatch() {
  let current = db.batch();
  let ops = 0;
  let sealed = false;
  const commits: Promise<unknown>[] = [];

  return {
    set(ref: DocumentReference, data: DocumentData, options: SetOptions) {
      if (sealed) throw new Error('chunkedBatch: set() after commit()');
      current.set(ref, data, options);
      ops++;
      if (ops >= BATCH_COMMIT_AT) {
        commits.push(current.commit());
        current = db.batch();
        ops = 0;
      }
    },
    async commit() {
      // Sealing makes a second commit() await the same already-settled
      // promises instead of re-committing a WriteBatch that has already run,
      // which would double-apply every FieldValue.increment in it.
      if (!sealed) {
        sealed = true;
        if (ops > 0) commits.push(current.commit());
        ops = 0;
      }
      await Promise.all(commits);
    },
  };
}

export async function aggregateEvents(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) return;

  // Buckets: campaign-hour, publisher-day, publisher-slot-day, creative-hour
  interface Bucket {
    impressions: number;
    clicks: number;
    pageviews: number;
    // Real page views (the `pageview` event) — distinct from `pageviews`, which is fed
    // by `slot_load` and remains the fill-rate denominator. Left undefined (never 0)
    // when a bucket saw no true page views, so the doc field stays absent.
    pageViewsTrue?: number;
    byCampaign: Record<string, { impressions: number; clicks: number }>;
    // Billed impressions and real traffic, split by bot class — publisher-day bucket
    // only (see the write-phase note below for why publisher-slot-day is excluded).
    // An event with no botClass (unclassified — see QueuedEvent.botClass) is counted
    // in NO class here, so `total - Σ classes` is the honest unclassified remainder.
    byBotClass?: Record<string, { impressions?: number; pageViewsTrue?: number }>;
  }
  interface CampaignBucket {
    impressions: number;
    clicks: number;
    byPublisher: Record<string, { impressions: number; clicks: number }>;
    byPublisherCreative: Record<string, Record<string, { impressions: number; clicks: number }>>;
    // Impressions only — clicks are out of scope for phase 1, and a true page view
    // never touches the campaign-hour bucket at all (it carries no campaign fill).
    byBotClass?: Record<string, { impressions?: number }>;
  }
  interface CreativeStats {
    impressions: number;
    clicks: number;
    pageviews: number;
  }
  const campaignHour = new Map<string, CampaignBucket>();
  const publisherDay = new Map<string, Bucket>();
  const publisherSlotDay = new Map<string, Bucket>();
  const creativeHour = new Map<string, CreativeStats>();

  for (const ev of events) {
    // Primary discriminator (see TRUE_PAGEVIEW_CREATIVE_ID above): a 'pageview'
    // event whose creativeId is anything other than the true-pageview marker is
    // a slot load, not a page view. Route it through the exact same path as
    // 'slot_load'.
    const isSlotLoadByMarker =
      ev.type === 'pageview' && ev.creativeId !== TRUE_PAGEVIEW_CREATIVE_ID;

    if (ev.type === 'slot_load' || isSlotLoadByMarker) {
      // 'slot_load' as an explicit wire type is accepted here purely for
      // forward/backward compatibility (an already-queued event, or some future
      // emitter) — apps/serving itself never sends it (see AdEvent.type in
      // apps/serving/src/lib/analytics.ts). The marker path above is what
      // production actually exercises.
      //
      // A slot load is one per ad request — the fill-rate denominator. The
      // `pageviews` field keeps its historical name and meaning regardless of
      // which of the two wire shapes fed it.
      const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
      const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
      for (const map of [publisherDay, publisherSlotDay]) {
        const key = map === publisherDay ? pd : psd;
        const b = map.get(key) ?? { impressions: 0, clicks: 0, pageviews: 0, byCampaign: {} };
        b.pageviews++;
        map.set(key, b);
      }

      // Track pageviews in creative stats too (for fallback/filler creatives)
      if (ev.creativeId) {
        const cr = `${ev.creativeId}/${hourKey(ev.ts)}`;
        const crb = creativeHour.get(cr) ?? { impressions: 0, clicks: 0, pageviews: 0 };
        crb.pageviews++;
        creativeHour.set(cr, crb);
      }
    } else if (ev.type === 'pageview') {
      // Real page view (creativeId === TRUE_PAGEVIEW_CREATIVE_ID, guaranteed by the
      // isSlotLoadByMarker check above) — one per page load, independent of ad-slot fill.
      // Only the publisher-day and publisher-slot-day buckets track it (no creative-hour
      // bookkeeping: a true pageview isn't tied to a served creative).
      const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
      const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
      for (const map of [publisherDay, publisherSlotDay]) {
        const key = map === publisherDay ? pd : psd;
        const b = map.get(key) ?? { impressions: 0, clicks: 0, pageviews: 0, byCampaign: {} };
        b.pageViewsTrue = (b.pageViewsTrue ?? 0) + 1;
        map.set(key, b);
      }
      // byBotClass is publisher-day only (see the Bucket.byBotClass comment above) —
      // deliberately not folded into the shared map loop, which also touches
      // publisher-slot-day.
      if (ev.botClass) {
        const b = publisherDay.get(pd)!;
        const cls = (b.byBotClass ??= {});
        const counts = (cls[ev.botClass] ??= {});
        counts.pageViewsTrue = (counts.pageViewsTrue ?? 0) + 1;
      }
    } else if (ev.type === 'impression' || ev.type === 'click') {
      // Explicitly impression/click only — NOT a bare `else`. A bare `else` here
      // is exactly the class of bug this fix wave exists to close: main's
      // pre-2026-08-09 aggregator classified events as `if (pageview) {...} else
      // { if (impression) impressions++ else clicks++ }`, so any event type it
      // didn't recognize (a renamed 'slot_load', or any future type) silently
      // fell through and was counted as a CLICK. Skip and warn instead of
      // guessing.
      const ch = `${ev.campaignId}/${hourKey(ev.ts)}`;
      const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
      const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
      const cr = `${ev.creativeId}/${hourKey(ev.ts)}`;

      const cb = campaignHour.get(ch) ?? {
        impressions: 0,
        clicks: 0,
        byPublisher: {},
        byPublisherCreative: {},
      };
      if (ev.type === 'impression') {
        cb.impressions++;
        if (!cb.byPublisher[ev.publisherId]) {
          cb.byPublisher[ev.publisherId] = { impressions: 0, clicks: 0 };
        }
        cb.byPublisher[ev.publisherId]!.impressions++;
      } else {
        cb.clicks++;
        if (!cb.byPublisher[ev.publisherId]) {
          cb.byPublisher[ev.publisherId] = { impressions: 0, clicks: 0 };
        }
        cb.byPublisher[ev.publisherId]!.clicks++;
      }
      if (ev.creativeId) {
        const forPub = (cb.byPublisherCreative[ev.publisherId] ??= {});
        const forCreative = (forPub[ev.creativeId] ??= { impressions: 0, clicks: 0 });
        if (ev.type === 'impression') forCreative.impressions++;
        else forCreative.clicks++;
      }
      // Impressions only (see CampaignBucket.byBotClass comment above) — clicks are
      // out of scope for phase 1.
      if (ev.botClass && ev.type === 'impression') {
        const cls = (cb.byBotClass ??= {});
        const counts = (cls[ev.botClass] ??= {});
        counts.impressions = (counts.impressions ?? 0) + 1;
      }
      campaignHour.set(ch, cb);

      // Guard the same way the pageview branch above does: an empty creativeId
      // produces a doc path like "stats/creatives//204008xx" (a bare "//"),
      // which firebase-admin's path validator rejects and would abort the
      // whole batch commit — losing every other bucket's writes along with it.
      if (ev.creativeId) {
        const crb = creativeHour.get(cr) ?? { impressions: 0, clicks: 0, pageviews: 0 };
        if (ev.type === 'impression') crb.impressions++;
        else crb.clicks++;
        creativeHour.set(cr, crb);
      }

      for (const map of [publisherDay, publisherSlotDay]) {
        const key = map === publisherDay ? pd : psd;
        const b = map.get(key) ?? { impressions: 0, clicks: 0, pageviews: 0, byCampaign: {} };
        if (!b.byCampaign) {
          b.byCampaign = {};
        }
        if (ev.type === 'impression') {
          b.impressions++;
          if (!b.byCampaign[ev.campaignId]) {
            b.byCampaign[ev.campaignId] = { impressions: 0, clicks: 0 };
          }
          b.byCampaign[ev.campaignId]!.impressions++;
        } else if (ev.campaignId !== 'cmp_fallback') {
          // Only count clicks from real campaigns so publisher CTR stays meaningful.
          // Fallback/house-ad clicks are tracked in creative stats but must not
          // inflate publisher click totals — their "impressions" are pageviews, not
          // impressions, which would otherwise produce CTR > 100%.
          b.clicks++;
          if (!b.byCampaign[ev.campaignId]) {
            b.byCampaign[ev.campaignId] = { impressions: 0, clicks: 0 };
          }
          b.byCampaign[ev.campaignId]!.clicks++;
        }
        map.set(key, b);
      }
      // byBotClass is publisher-day only, impressions only (see the Bucket.byBotClass
      // and CampaignBucket.byBotClass comments above) — deliberately outside the
      // shared map loop, which also touches publisher-slot-day and would otherwise
      // count clicks too.
      if (ev.botClass && ev.type === 'impression') {
        const b = publisherDay.get(pd)!;
        const cls = (b.byBotClass ??= {});
        const counts = (cls[ev.botClass] ??= {});
        counts.impressions = (counts.impressions ?? 0) + 1;
      }
    } else {
      // Unknown event type: skip rather than silently miscounting it as a
      // click (see the comment above the impression/click branch). Cast
      // needed only because TS has narrowed `ev.type` to `never` here — every
      // literal in the QueuedEvent union is provably handled above.
      console.warn(
        `[stats-aggregator] Skipping event with unrecognized type: ${String((ev as { type: unknown }).type)}`,
      );
    }
  }

  // NOTE ON MERGE SEMANTICS: firebase-admin's `batch.set(ref, data, { merge: true })`
  // does NOT split dotted-key field names into nested paths — only `update()` does
  // that. A key literally named "byPublisher.pub_a.impressions" would land as a flat
  // top-level field with a dot in its name, invisible to any reader doing
  // `data.byPublisher`. `set(..., { merge: true })` DOES recursively merge nested
  // *object* literals (verified against the emulator: two batches each incrementing
  // `{ byPublisher: { pub_a: { impressions: FieldValue.increment(n) } } }` accumulate
  // instead of overwriting each other). So every per-key breakdown below must be built
  // as a nested object with `FieldValue.increment` at the leaves, never as a dotted
  // field-path string.
  // Firestore caps a batched write at 500 operations. Nothing enforced that
  // before, because the drain was slow enough that a run never accumulated
  // enough buckets to reach it — speeding the drain up would have turned a
  // timeout into a hard INVALID_ARGUMENT. Committing in chunks also means a
  // failure late in the write phase loses only the uncommitted chunks rather
  // than every bucket in the run — strictly better than before, since the
  // events are already gone from Redis either way. Note what it does NOT buy:
  // the recorded:{hour} counters below never run when commit() throws, so the
  // daily reconciliation cron still sees the whole batch as missing even when
  // some chunks landed. It over-reports drift on a partial failure; it never
  // under-reports it.
  const batch = chunkedBatch();

  for (const [key, b] of campaignHour) {
    const [campaignId, hk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/campaigns/${campaignId}/${hk}`);
    const totalSpendIsk = Math.round((b.impressions / 1000) * FLAT_CPM_ISK);
    const updateData: Record<string, any> = {
      impressions: FieldValue.increment(b.impressions),
      clicks: FieldValue.increment(b.clicks),
      spendIsk: FieldValue.increment(totalSpendIsk),
    };

    if (Object.keys(b.byPublisher).length > 0) {
      const byPublisher: Record<string, any> = {};
      for (const [pubId, pubStats] of Object.entries(b.byPublisher)) {
        const pubSpendIsk = Math.round((pubStats.impressions / 1000) * FLAT_CPM_ISK);
        byPublisher[pubId] = {
          impressions: FieldValue.increment(pubStats.impressions),
          clicks: FieldValue.increment(pubStats.clicks),
          spendIsk: FieldValue.increment(pubSpendIsk),
        };
      }
      updateData.byPublisher = byPublisher;
    }

    if (Object.keys(b.byPublisherCreative).length > 0) {
      const byPublisherCreative: Record<string, any> = {};
      for (const [pubId, creatives] of Object.entries(b.byPublisherCreative)) {
        const forPub: Record<string, any> = {};
        for (const [creativeId, cStats] of Object.entries(creatives)) {
          forPub[creativeId] = {
            impressions: FieldValue.increment(cStats.impressions),
            clicks: FieldValue.increment(cStats.clicks),
          };
        }
        byPublisherCreative[pubId] = forPub;
      }
      updateData.byPublisherCreative = byPublisherCreative;
    }

    if (b.byBotClass) {
      updateData.byBotClass = byBotClassIncrement(b.byBotClass);
    }

    batch.set(ref, updateData, { merge: true });
  }
  for (const [key, b] of creativeHour) {
    const [creativeId, hk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/creatives/${creativeId}/${hk}`);
    batch.set(
      ref,
      {
        impressions: FieldValue.increment(b.impressions),
        clicks: FieldValue.increment(b.clicks),
        pageviews: FieldValue.increment(b.pageviews),
      },
      { merge: true },
    );
  }
  for (const [key, b] of publisherDay) {
    const [publisherId, dk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dk}`);
    const updateData: Record<string, any> = {
      impressions: FieldValue.increment(b.impressions),
      clicks: FieldValue.increment(b.clicks),
      pageviews: FieldValue.increment(b.pageviews),
      spendIsk: FieldValue.increment(Math.round((b.impressions / 1000) * FLAT_CPM_ISK)),
    };
    // Only written when the bucket actually saw a pageview event — leaving the field
    // absent (never FieldValue.increment(0)) lets the dashboard distinguish "no accurate
    // data yet" from "zero traffic" for days that predate this event type.
    if (b.pageViewsTrue) {
      updateData.pageViewsTrue = FieldValue.increment(b.pageViewsTrue);
    }
    if (b.byCampaign && Object.keys(b.byCampaign).length > 0) {
      const byCampaign: Record<string, any> = {};
      for (const [campaignId, campStats] of Object.entries(b.byCampaign)) {
        byCampaign[campaignId] = {
          impressions: FieldValue.increment(campStats.impressions),
          clicks: FieldValue.increment(campStats.clicks),
        };
      }
      updateData.byCampaign = byCampaign;
    }
    // Publisher-day only — deliberately not applied to publisher-slot-day below.
    // Nobody reports bot share per slot and the extra cardinality buys nothing.
    if (b.byBotClass) {
      updateData.byBotClass = byBotClassIncrement(b.byBotClass);
    }
    batch.set(ref, updateData, { merge: true });
  }
  for (const [key, b] of publisherSlotDay) {
    const [publisherId, slotId, dk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/publisher_slots/${publisherId}_${slotId}/${dk}`);
    const updateData: Record<string, any> = {
      impressions: FieldValue.increment(b.impressions),
      clicks: FieldValue.increment(b.clicks),
      pageviews: FieldValue.increment(b.pageviews),
      spendIsk: FieldValue.increment(Math.round((b.impressions / 1000) * FLAT_CPM_ISK)),
    };
    if (b.pageViewsTrue) {
      updateData.pageViewsTrue = FieldValue.increment(b.pageViewsTrue);
    }
    if (b.byCampaign && Object.keys(b.byCampaign).length > 0) {
      const byCampaign: Record<string, any> = {};
      for (const [campaignId, campStats] of Object.entries(b.byCampaign)) {
        byCampaign[campaignId] = {
          impressions: FieldValue.increment(campStats.impressions),
          clicks: FieldValue.increment(campStats.clicks),
        };
      }
      updateData.byCampaign = byCampaign;
    }
    batch.set(ref, updateData, { merge: true });
  }

  await batch.commit();

  // recorded:{hour} mirrors serving's emitted:{hour} — the daily reconciliation cron
  // compares the two to catch events that were emitted but never made it into a stats
  // doc. One event, one increment, bucketed by the event's own ts; a single pipeline
  // round trip for the whole batch.
  const redis = getRedis();
  const pipeline = redis.pipeline();
  for (const ev of events) {
    const key = recordedCounterKey(ev.ts);
    pipeline.incr(key);
    pipeline.expire(key, RECORDED_COUNTER_TTL_SECONDS);
  }
  await pipeline.exec();
}

/**
 * Events popped per Redis round trip.
 *
 * This used to be one. Upstash is a REST API, so a 1000-event batch meant
 * 1000 sequential HTTPS requests, and the cron entrypoint ran up to five such
 * batches — which is why /api/cron-aggregate returned a 60-second Vercel
 * timeout every hour from 19:00 on 2026-08-11 while events:stats grew to
 * 1103. `RPOP key count` collapses each chunk into a single request.
 */
const RPOP_CHUNK = 200;

/**
 * Wall-clock budget for one cron invocation.
 *
 * Checked between batches, so the real worst case is this budget plus one
 * batch's duration plus the heartbeat and watchdog work the cron entrypoint
 * does afterwards — which is why it is well under Vercel's 60s cap rather
 * than close to it.
 */
const DEFAULT_AGGREGATE_DEADLINE_MS = 30_000;

/**
 * Normalizes `rpop(key, count)`, which yields an array, a bare value, or null.
 *
 * `rawCount` is how many entries Redis actually handed back, which is NOT
 * `events.length` when an entry fails to parse. The drain uses the raw count
 * to decide whether the queue is exhausted — see the short-read note there.
 */
function toEventList(raw: unknown): { events: QueuedEvent[]; rawCount: number } {
  if (raw == null) return { events: [], rawCount: 0 };
  const items = (Array.isArray(raw) ? raw : [raw]).filter((i) => i != null);
  const events: QueuedEvent[] = [];
  for (const item of items) {
    try {
      // The Upstash SDK auto-deserializes JSON, so an item may already be an object.
      events.push(
        typeof item === 'string' ? (JSON.parse(item) as QueuedEvent) : (item as QueuedEvent),
      );
    } catch {
      console.warn('[cron-aggregate] Failed to parse event from queue:', typeof item, item);
    }
  }
  return { events, rawCount: items.length };
}

export async function drainAndAggregate(batchSize = 1000): Promise<number> {
  const redis = getRedis();
  const events: QueuedEvent[] = [];
  // Drain the stats queue, then the legacy shared queue (so events enqueued before the
  // stats/accrual split aren't lost). Accrual no longer touches the legacy queue, so there
  // is no contention here.
  for (const queue of [EVENT_QUEUE_STATS, EVENT_QUEUE_LEGACY]) {
    while (events.length < batchSize) {
      const want = Math.min(RPOP_CHUNK, batchSize - events.length);
      const { events: popped, rawCount } = toEventList(await redis.rpop<unknown>(queue, want));
      // Both of these test the RAW count on purpose. Testing the parsed count
      // instead conflates "the queue is empty" with "this chunk contained
      // something that failed to parse": one malformed entry among 400 good
      // ones ended the drain after a single chunk and stranded the rest, and a
      // chunk of nothing but garbage made the whole run look like an empty
      // queue — the unbounded-backlog failure this fix exists to prevent.
      if (rawCount === 0) break;
      events.push(...popped);
      // A short read means the queue is drained; asking again just costs a
      // round trip to be told the same thing.
      if (rawCount < want) break;
    }
  }
  await aggregateEvents(events);
  return events.length;
}

export interface AggregateRunResult {
  aggregated: number;
  batches: number;
  /** True when the wall-clock budget, not an empty queue, ended the run. */
  timedOut: boolean;
  /** True when the batch cap, not an empty queue, ended the run. */
  capped: boolean;
}

/**
 * Drain the stats queues until they run dry, the batch cap is hit, or the
 * time budget runs out.
 *
 * The deadline is the durable half of the timeout fix: however large the
 * backlog gets, a run now stops early and leaves the rest for the next hour
 * instead of being killed mid-flight by the platform. A killed run records no
 * heartbeat, and the heartbeat watchdog lives inside this very cron — so a
 * 504 here also silenced the alerting for every other cron.
 */
export async function drainAndAggregateAll(
  opts: { batchSize?: number; maxBatches?: number; deadlineMs?: number; now?: () => number } = {},
): Promise<AggregateRunResult> {
  const batchSize = opts.batchSize ?? 1000;
  const maxBatches = opts.maxBatches ?? 5;
  const now = opts.now ?? Date.now;
  const deadlineAt = now() + (opts.deadlineMs ?? DEFAULT_AGGREGATE_DEADLINE_MS);

  let aggregated = 0;
  let batches = 0;
  let timedOut = false;
  // Only an empty batch proves the queues ran dry. Exiting the loop any other
  // way means work was left behind, and "left work behind" has to be
  // distinguishable from "nothing to do" — otherwise a cron that is
  // permanently an hour behind looks exactly like a healthy one.
  let drained = false;

  while (batches < maxBatches) {
    if (now() >= deadlineAt) {
      timedOut = true;
      break;
    }
    const n = await drainAndAggregate(batchSize);
    batches++;
    aggregated += n;
    if (n === 0) {
      drained = true;
      break;
    }
  }

  return { aggregated, batches, timedOut, capped: !drained && !timedOut };
}
