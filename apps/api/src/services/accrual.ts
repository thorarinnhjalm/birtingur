import { getRedis } from '../lib/redis.js';
import { COLLECTIONS, campaignConverter } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { chargeCampaign, creditPublisher } from './wallet.js';
import { pushCacheForCampaign } from '../lib/push-cache.js';
import { FLAT_CPM_ISK } from '@ada/shared';

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

    // Count impressions per publisher (flat CPM, so price is uniform).
    const countByPublisher = new Map<string, number>();
    for (const ev of evs) {
      countByPublisher.set(ev.publisherId, (countByPublisher.get(ev.publisherId) ?? 0) + 1);
    }

    // Gross per publisher = round(cpm * count / 1000); campaign charge = sum (conserves money).
    const grossByPublisher = new Map<string, number>();
    let totalCharge = 0;
    for (const [publisherId, count] of countByPublisher) {
      const gross = Math.round((FLAT_CPM_ISK * count) / 1000);
      if (gross <= 0) continue;
      grossByPublisher.set(publisherId, gross);
      totalCharge += gross;
    }

    if (totalCharge > 0) {
      try {
        await chargeCampaign(cmp.advertiserId, campaignId, totalCharge);
      } catch (err) {
        // out of balance — campaign should already be marked budgetExhausted by serving counter
        console.warn(`Campaign charge failed for ${campaignId}, pausing:`, err);
        // Explicitly pause the campaign in Firestore and push cache to Redis to stop any leak
        await db.collection(COLLECTIONS.campaigns).doc(campaignId).update({
          status: 'paused',
        });
        await pushCacheForCampaign(campaignId);
        continue;
      }

      // Decrement the campaign remaining budget in Firestore atomically
      const newRemaining = Math.max(0, cmp.budget.remainingIsk - totalCharge);
      await db.collection(COLLECTIONS.campaigns).doc(campaignId).update({
        'budget.remainingIsk': newRemaining,
        ...(newRemaining <= 0 ? { status: 'paused' } : {}),
      });
      await pushCacheForCampaign(campaignId); // re-push so budgetExhausted + Redis counter refresh

      for (const [publisherId, gross] of grossByPublisher) {
        await creditPublisher(publisherId, campaignId, gross);
      }
    }
  }

  return events.length;
}
