import { COLLECTIONS } from '@ada/shared/firestore';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_LEGACY, FLAT_CPM_ISK } from '@ada/shared';
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
    byCampaign: Record<string, { impressions: number; clicks: number }>;
  }
  interface CampaignBucket {
    impressions: number;
    clicks: number;
    byPublisher: Record<string, { impressions: number; clicks: number }>;
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
    if (ev.type === 'pageview') {
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
    } else {
      const ch = `${ev.campaignId}/${hourKey(ev.ts)}`;
      const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
      const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
      const cr = `${ev.creativeId}/${hourKey(ev.ts)}`;

      const cb = campaignHour.get(ch) ?? {
        impressions: 0,
        clicks: 0,
        byPublisher: {},
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
      campaignHour.set(ch, cb);

      const crb = creativeHour.get(cr) ?? { impressions: 0, clicks: 0, pageviews: 0 };
      if (ev.type === 'impression') crb.impressions++;
      else crb.clicks++;
      creativeHour.set(cr, crb);

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

    for (const [pubId, pubStats] of Object.entries(b.byPublisher)) {
      const pubSpendIsk = Math.round((pubStats.impressions / 1000) * FLAT_CPM_ISK);
      updateData[`byPublisher.${pubId}.impressions`] = FieldValue.increment(pubStats.impressions);
      updateData[`byPublisher.${pubId}.clicks`] = FieldValue.increment(pubStats.clicks);
      updateData[`byPublisher.${pubId}.spendIsk`] = FieldValue.increment(pubSpendIsk);
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
    if (b.byCampaign) {
      for (const [campaignId, campStats] of Object.entries(b.byCampaign)) {
        updateData[`byCampaign.${campaignId}.impressions`] = FieldValue.increment(
          campStats.impressions,
        );
        updateData[`byCampaign.${campaignId}.clicks`] = FieldValue.increment(campStats.clicks);
      }
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
    if (b.byCampaign) {
      for (const [campaignId, campStats] of Object.entries(b.byCampaign)) {
        updateData[`byCampaign.${campaignId}.impressions`] = FieldValue.increment(
          campStats.impressions,
        );
        updateData[`byCampaign.${campaignId}.clicks`] = FieldValue.increment(campStats.clicks);
      }
    }
    batch.set(ref, updateData, { merge: true });
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
