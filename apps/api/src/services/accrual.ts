import { getRedis } from '../lib/redis';
import { COLLECTIONS, campaignConverter, slotConverter } from '@ada/shared/firestore';
import { db } from '../lib/firebase';
import { chargeCampaign, creditPublisher } from './wallet';

interface QueuedEvent {
  type: 'impression' | 'click';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  ts: number;
}

/** Drain up to `batchSize` events and process them. Returns count drained. */
export async function drainAndAccrue(batchSize = 500): Promise<number> {
  let redis;
  try {
    redis = getRedis();
  } catch {
    // If Redis is not configured (e.g. offline testing), skip
    return 0;
  }

  const events: QueuedEvent[] = [];

  for (let i = 0; i < batchSize; i++) {
    const raw = await redis.rpop<string>('events:queue');
    if (!raw) break;
    try {
      events.push(JSON.parse(raw) as QueuedEvent);
    } catch {
      // skip malformed
    }
  }

  if (events.length === 0) return 0;

  // Group by campaign for charging
  const byCampaign = new Map<string, QueuedEvent[]>();
  for (const ev of events) {
    if (ev.type !== 'impression') continue;
    const list = byCampaign.get(ev.campaignId) ?? [];
    list.push(ev);
    byCampaign.set(ev.campaignId, list);
  }

  for (const [campaignId, evs] of byCampaign) {
    const cmpSnap = await db
      .collection(COLLECTIONS.campaigns)
      .doc(campaignId)
      .withConverter(campaignConverter)
      .get();

    if (!cmpSnap.exists) continue;
    const cmp = cmpSnap.data()!;
    if (cmp.budget.mode !== 'cpm_capped') continue;

    // Determine CPM from each impression's slot
    let totalCharge = 0;
    const publisherCharges = new Map<string, number>();

    for (const ev of evs) {
      const slotSnap = await db
        .collection(COLLECTIONS.slots)
        .doc(ev.slotId)
        .withConverter(slotConverter)
        .get();

      if (!slotSnap.exists) continue;
      const slot = slotSnap.data()!;
      const cpm = slot.pricing.mode === 'cpm' ? (slot.pricing.cpmIsk ?? 0) : 0;
      const perImpression = Math.round(cpm / 1000);

      totalCharge += perImpression;
      publisherCharges.set(
        ev.publisherId,
        (publisherCharges.get(ev.publisherId) ?? 0) + perImpression
      );
    }

    if (totalCharge > 0) {
      try {
        await chargeCampaign(cmp.advertiserId, campaignId, totalCharge);
      } catch (err) {
        // out of balance — campaign should already be marked budgetExhausted by serving counter
        console.warn(`Campaign charge failed for ${campaignId}:`, err);
        continue;
      }

      for (const [publisherId, amount] of publisherCharges) {
        await creditPublisher(publisherId, campaignId, amount);
      }
    }
  }

  return events.length;
}
