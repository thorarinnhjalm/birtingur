import { COLLECTIONS } from '@ada/shared/firestore';
import { db } from '../lib/firebase';
import { Redis } from '@upstash/redis';
import { FieldValue } from 'firebase-admin/firestore';

export interface QueuedEvent {
  type: 'impression' | 'click';
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

  // Buckets: campaign-hour, publisher-day, publisher-slot-day
  interface Bucket {
    impressions: number;
    clicks: number;
  }
  const campaignHour = new Map<string, Bucket>();
  const publisherDay = new Map<string, Bucket>();
  const publisherSlotDay = new Map<string, Bucket>();

  for (const ev of events) {
    const ch = `${ev.campaignId}/${hourKey(ev.ts)}`;
    const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
    const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
    for (const map of [campaignHour, publisherDay, publisherSlotDay]) {
      const key = map === campaignHour ? ch : map === publisherDay ? pd : psd;
      const b = map.get(key) ?? { impressions: 0, clicks: 0 };
      if (ev.type === 'impression') b.impressions++;
      else b.clicks++;
      map.set(key, b);
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
      { merge: true }
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
      },
      { merge: true }
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
      },
      { merge: true }
    );
  }

  await batch.commit();
}

let _redis: Redis | null = null;
function redis() {
  if (_redis) return _redis;
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return _redis;
}

export async function drainAndAggregate(batchSize = 1000): Promise<number> {
  const events: QueuedEvent[] = [];
  for (let i = 0; i < batchSize; i++) {
    const raw = await redis().rpop<string>('events:queue');
    if (!raw) break;
    try {
      events.push(JSON.parse(raw) as QueuedEvent);
    } catch {
      /* skip */
    }
  }
  await aggregateEvents(events);
  return events.length;
}
