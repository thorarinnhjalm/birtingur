import { COLLECTIONS } from '@ada/shared/firestore';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_LEGACY } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { getRedis } from '../lib/redis.js';
import { FieldValue } from 'firebase-admin/firestore';

export interface QueuedEvent {
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

export async function aggregateEvents(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) return;

  // Buckets: campaign-hour, publisher-day, publisher-slot-day, creative-hour
  interface Bucket {
    impressions: number;
    clicks: number;
    pageviews: number;
  }
  const campaignHour = new Map<string, Bucket>();
  const publisherDay = new Map<string, Bucket>();
  const publisherSlotDay = new Map<string, Bucket>();
  const creativeHour = new Map<string, Bucket>();

  for (const ev of events) {
    if (ev.type === 'pageview') {
      const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
      const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
      for (const map of [publisherDay, publisherSlotDay]) {
        const key = map === publisherDay ? pd : psd;
        const b = map.get(key) ?? { impressions: 0, clicks: 0, pageviews: 0 };
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
    } else {
      const ch = `${ev.campaignId}/${hourKey(ev.ts)}`;
      const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
      const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
      const cr = `${ev.creativeId}/${hourKey(ev.ts)}`;

      const cb = campaignHour.get(ch) ?? { impressions: 0, clicks: 0, pageviews: 0 };
      if (ev.type === 'impression') cb.impressions++;
      else cb.clicks++;
      campaignHour.set(ch, cb);

      const crb = creativeHour.get(cr) ?? { impressions: 0, clicks: 0, pageviews: 0 };
      if (ev.type === 'impression') crb.impressions++;
      else crb.clicks++;
      creativeHour.set(cr, crb);

      for (const map of [publisherDay, publisherSlotDay]) {
        const key = map === publisherDay ? pd : psd;
        const b = map.get(key) ?? { impressions: 0, clicks: 0, pageviews: 0 };
        if (ev.type === 'impression') b.impressions++;
        else b.clicks++;
        map.set(key, b);
      }
    }
  }

  const batch = db.batch();

  for (const [key, b] of campaignHour) {
    const [campaignId, hk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/campaigns/${campaignId}/${hk}`);
    batch.set(
      ref,
      {
        impressions: FieldValue.increment(b.impressions),
        clicks: FieldValue.increment(b.clicks),
      },
      { merge: true },
    );
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
  for (const [key, b] of publisherSlotDay) {
    const [publisherId, slotId, dk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/publisher_slots/${publisherId}_${slotId}/${dk}`);
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

  await batch.commit();
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
