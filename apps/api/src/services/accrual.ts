import { getRedis } from '../lib/redis.js';
import { COLLECTIONS, campaignConverter } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { chargeCampaign, creditPublisher } from './wallet.js';
import { pushCacheForCampaign } from '../lib/push-cache.js';
import { FLAT_CPM_ISK, EVENT_QUEUE_ACCRUAL } from '@ada/shared';
import { AppError } from '../lib/errors.js';

interface QueuedEvent {
  type: 'impression' | 'click';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  ts: number;
}

interface DrainBatchResult {
  drained: number;
  requeued: number;
}

/**
 * Pop up to `batchSize` events and process them, grouped by campaign.
 *
 * Accrual events carry no signature, so there is no dedup safety net — the
 * only thing that makes re-queueing on failure safe is SCOPE: a campaign's
 * events are only ever pushed back to the queue while its charge has NOT
 * gone through this run. A per-campaign `charged` flag tracks this
 * explicitly and gates the outer catch — once `chargeCampaign` has
 * succeeded, nothing later in this iteration (including its own failures)
 * is allowed to re-queue those events, so a retried run can never
 * double-bill this campaign. The insufficient-funds path is a *handled*
 * failure (charge never succeeded either) that pauses the campaign and
 * `continue`s — it must never fall into the outer catch, or its events
 * would come back for a campaign that's now paused specifically because
 * it's out of money.
 */
async function drainBatch(batchSize: number): Promise<DrainBatchResult> {
  let redis;
  try {
    redis = getRedis();
  } catch {
    // If Redis is not configured (e.g. offline testing), skip
    return { drained: 0, requeued: 0 };
  }

  const events: QueuedEvent[] = [];

  for (let i = 0; i < batchSize; i++) {
    const raw = await redis.rpop<string | QueuedEvent>(EVENT_QUEUE_ACCRUAL);
    if (!raw) break;
    try {
      // Upstash SDK auto-deserializes JSON, so `raw` may already be an object.
      const ev: QueuedEvent = typeof raw === 'string' ? JSON.parse(raw) : raw;
      events.push(ev);
    } catch {
      console.warn('[cron-accrue] Failed to parse event from queue:', typeof raw, raw);
    }
  }

  if (events.length === 0) return { drained: 0, requeued: 0 };

  // Group by campaign for charging
  const byCampaign = new Map<string, QueuedEvent[]>();
  for (const ev of events) {
    if (ev.type !== 'impression') continue;
    const list = byCampaign.get(ev.campaignId) ?? [];
    list.push(ev);
    byCampaign.set(ev.campaignId, list);
  }

  let requeued = 0;

  for (const [campaignId, evs] of byCampaign) {
    // Tracks whether chargeCampaign succeeded for THIS campaign in this
    // batch. Once true, the events must never be re-queued — even if a
    // later step (decrement, cache push, publisher credit) throws — because
    // re-queueing would replay a charge that already happened and double-bill
    // the advertiser on the next run. A post-charge failure is a real
    // problem (ledger/budget drift, or a publisher credit that didn't land),
    // but it's a job for the daily reconciliation cron and ops alerting, not
    // for the queue.
    let charged = false;
    try {
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
          charged = true;
        } catch (err) {
          // Only the handled insufficient-funds case pauses-and-continues
          // here. Any other failure (e.g. Firestore unavailable) has also
          // NOT charged the campaign, but is unexpected rather than a normal
          // "out of money" outcome — rethrow so the outer catch re-queues
          // this campaign's events for the next run instead of pausing it.
          if (!(err instanceof AppError) || err.code !== 'INSUFFICIENT_BALANCE') {
            throw err;
          }
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
        await db
          .collection(COLLECTIONS.campaigns)
          .doc(campaignId)
          .update({
            'budget.remainingIsk': newRemaining,
            ...(newRemaining <= 0 ? { status: 'paused' } : {}),
          });
        await pushCacheForCampaign(campaignId); // re-push so budgetExhausted + Redis counter refresh

        for (const [publisherId, gross] of grossByPublisher) {
          await creditPublisher(publisherId, campaignId, gross);
        }
      }
    } catch (err) {
      if (charged) {
        // The charge already went through — re-queueing now would replay it
        // on the next run and double-bill the advertiser. Surface this
        // loudly instead: it means a post-charge step (budget decrement,
        // cache push, or publisher credit) failed, which the reconciliation
        // cron (services/reconciliation.ts) is designed to catch as
        // ledger/budget drift.
        console.error(
          `[cron-accrue] ${campaignId} charged but a post-charge step failed — NOT re-queueing (would double-bill):`,
          err,
        );
        continue;
      }
      // Unexpected failure (not the handled insufficient-funds path above,
      // which already `continue`s before reaching here) that happened
      // BEFORE the charge went through — this campaign's raw events are
      // safe to put back for the next run to retry.
      console.warn(`[cron-accrue] re-queueing ${evs.length} events for ${campaignId}:`, err);
      for (const ev of evs) {
        await redis.lpush(EVENT_QUEUE_ACCRUAL, JSON.stringify(ev));
      }
      requeued += evs.length;
    }
  }

  return { drained: events.length, requeued };
}

/** Drain up to `batchSize` events and process them. Returns count drained. */
export async function drainAndAccrue(batchSize = 500): Promise<number> {
  const res = await drainBatch(batchSize);
  return res.drained;
}

/**
 * Loop `drainBatch` until the queue is exhausted, a batch makes no forward
 * progress (everything in it got re-queued), or `maxBatches` is hit — the
 * safety valve against a runaway loop within a single cron invocation.
 */
export async function drainAndAccrueAll(opts?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<{ drained: number; batches: number; requeued: number }> {
  const batchSize = opts?.batchSize ?? 500;
  const maxBatches = opts?.maxBatches ?? 20;
  let drained = 0;
  let requeued = 0;
  let batches = 0;
  for (; batches < maxBatches; batches++) {
    const res = await drainBatch(batchSize);
    drained += res.drained;
    requeued += res.requeued;
    // Stop when the queue yielded less than a full batch (empty), or when a
    // batch made no forward progress (everything re-queued — retrying in
    // this run would just spin on the same failure).
    if (res.drained < batchSize || res.drained === res.requeued) break;
  }
  return { drained, batches: batches + 1, requeued };
}
