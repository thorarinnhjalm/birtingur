import { COLLECTIONS } from '@ada/shared/firestore';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_LEGACY, FLAT_CPM_ISK } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { getRedis } from '../lib/redis.js';
import { FieldValue } from 'firebase-admin/firestore';

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
  }
  interface CampaignBucket {
    impressions: number;
    clicks: number;
    byPublisher: Record<string, { impressions: number; clicks: number }>;
    byPublisherCreative: Record<string, Record<string, { impressions: number; clicks: number }>>;
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
    if (ev.type === 'slot_load') {
      // slot_load is one per ad request — the fill-rate denominator. It takes over the
      // bookkeeping the old 'pageview' branch used to do (the `pageviews` field keeps its
      // existing meaning; only the event type feeding it has changed).
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
      // Real page view — one per page load, independent of ad-slot fill. Only the
      // publisher-day and publisher-slot-day buckets track it (no creative-hour
      // bookkeeping: a true pageview isn't tied to a served creative).
      const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
      const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
      for (const map of [publisherDay, publisherSlotDay]) {
        const key = map === publisherDay ? pd : psd;
        const b = map.get(key) ?? { impressions: 0, clicks: 0, pageviews: 0, byCampaign: {} };
        b.pageViewsTrue = (b.pageViewsTrue ?? 0) + 1;
        map.set(key, b);
      }
    } else {
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
  const batch = db.batch();

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

export async function drainAndAggregate(batchSize = 1000): Promise<number> {
  const redis = getRedis();
  const events: QueuedEvent[] = [];
  // Drain the stats queue, then the legacy shared queue (so events enqueued before the
  // stats/accrual split aren't lost). Accrual no longer touches the legacy queue, so there
  // is no contention here.
  for (const queue of [EVENT_QUEUE_STATS, EVENT_QUEUE_LEGACY]) {
    while (events.length < batchSize) {
      const raw = await redis.rpop<string | QueuedEvent>(queue);
      if (!raw) break;
      try {
        // Upstash SDK auto-deserializes JSON, so `raw` may already be an object.
        // Only call JSON.parse when it's still a string.
        const ev: QueuedEvent = typeof raw === 'string' ? JSON.parse(raw) : raw;
        events.push(ev);
      } catch {
        console.warn('[cron-aggregate] Failed to parse event from queue:', typeof raw, raw);
      }
    }
  }
  await aggregateEvents(events);
  return events.length;
}
