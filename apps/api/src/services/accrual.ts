import { getRedis } from '../lib/redis.js';
import { COLLECTIONS, campaignConverter } from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { chargeCampaign, creditPublisher } from './wallet.js';
import { pushCacheForCampaign } from '../lib/push-cache.js';
import { FLAT_CPM_ISK, EVENT_QUEUE_ACCRUAL, DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';
import { AppError } from '../lib/errors.js';
import { alertOps, alreadyAlerted } from './ops-alerts.js';

interface QueuedEvent {
  type: 'impression' | 'click';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  ts: number;
}

/**
 * Smallest gross that `creditPublisher` can split into a whole-króna
 * publisher credit and a whole-króna platform fee.
 *
 * The fee is `round(gross * feePercent / 100)`, so it only reaches 1 ISK once
 * `gross >= 50 / feePercent` — 3 ISK at the current 20%. Below that the fee
 * rounds to zero, and `LedgerEntrySchema` rejects a zero-amount entry, which
 * is exactly the error that made every cron-accrue run throw on 2026-08-11:
 * the campaign was charged, the publisher credited, and then the fee entry
 * blew up, aborting the rest of the batch. At a 550 ISK CPM this covers any
 * publisher with fewer than five impressions in a single run, which on a
 * long-tail network is most of them.
 */
export const MIN_SPLITTABLE_GROSS_ISK = Math.ceil(50 / DEFAULT_PLATFORM_FEE_PERCENT);

const ACCRUAL_FAIL_PREFIX = 'accrual-fail:';
// A campaign that fails to charge (for a reason OTHER than insufficient
// funds — see the narrowed inner catch below) gets its events re-queued for
// the next run to retry. That's fine for a transient blip, but a campaign
// that keeps failing run after run would otherwise serve unbilled forever:
// it stays `active`, its budget never decrements, and cron-refresh-cache
// keeps reseeding its Redis budget counter. This counter (persisted in
// Redis so it survives across cron invocations, not just within one run)
// tracks consecutive failures per campaign; crossing the threshold pauses
// the campaign — exactly like the insufficient-funds path — and pages ops,
// instead of retrying silently forever.
// NOTE: this counts consecutive drainBatch() CALLS that fail to charge this
// campaign, not consecutive cron RUNS. drainAndAccrueAll can invoke
// drainBatch several times within one cron invocation, and a re-queued
// event goes to the HEAD of the list (lpush) while drainBatch reads from
// the TAIL (rpop) — so a single busy invocation can re-pop the very events
// it just re-queued and fail them again before that invocation ends. That
// means the threshold can be crossed (and the campaign paused) WITHIN one
// 15-minute cron tick, not only across ~3 separate ticks. Read this as "3
// consecutive failed charge attempts", not a wall-clock duration. Kept
// per-batch (not keyed per drainAndAccrueAll run) deliberately: threading a
// "this run's attempt count" through drainBatch would need extra state
// passed across every call for a comment-accuracy fix, which isn't worth
// the added surface area in money code — the counter's job (stop an
// endlessly-retrying campaign from serving unbilled forever) still holds
// either way.
const ACCRUAL_FAIL_THRESHOLD = 3;
const ACCRUAL_FAIL_TTL_SECONDS = 4 * 60 * 60; // a few hours — bounds a sparse-but-not-consecutive failure streak

interface DrainBatchResult {
  drained: number;
  requeued: number;
  /**
   * Events pushed back because their gross was too small to split yet. Kept
   * apart from `requeued` (which means "a failure sent these back to be
   * retried") because a run where every publisher is below threshold is
   * normal operation on a long-tail network, not a stalled pipeline — and
   * the zero-progress alert in drainAndAccrueAll must not page ops for it.
   */
  deferred: number;
}

/**
 * Push events back onto the accrual queue, one at a time, tolerating a
 * failed individual `lpush` instead of letting it throw and cascade to
 * whatever called this (which — for the campaign-loop callers below — would
 * otherwise abort processing of every campaign not yet reached and lose
 * their already-popped events too). A push that fails here means the event
 * is genuinely unrecoverable (Redis itself refused the write), so it is
 * logged with its full payload as the forensic record of last resort.
 * Returns how many of `events` actually made it back onto the queue.
 */
async function safeRequeue(
  redis: ReturnType<typeof getRedis>,
  events: QueuedEvent[],
  context: string,
): Promise<number> {
  let pushed = 0;
  for (const ev of events) {
    try {
      await redis.lpush(EVENT_QUEUE_ACCRUAL, JSON.stringify(ev));
      pushed++;
    } catch (err) {
      console.error(
        `[cron-accrue] failed to re-queue an event during ${context} — event LOST, forensic record follows:`,
        JSON.stringify(ev),
        err,
      );
    }
  }
  return pushed;
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
 *
 * SAFETY NET: `pending` starts as a copy of every campaign's events for
 * this batch and is drained down to empty as each campaign is resolved
 * (charged, deliberately dropped, or re-queued). The `finally` around the
 * whole loop pushes back whatever is STILL in `pending` — i.e. any
 * campaign the loop never got to resolve because something threw in a way
 * none of the per-campaign handling below caught. This is what guarantees
 * an infra-level blip (Redis or Firestore going away mid-loop) can only
 * ever cost already-charged campaigns nothing and every other campaign at
 * most a retry next run, never silent loss — see
 * docs/superpowers/specs/2026-08-08-payout-integrity-design.md Part 3.
 */
async function drainBatch(batchSize: number): Promise<DrainBatchResult> {
  let redis;
  try {
    redis = getRedis();
  } catch {
    // If Redis is not configured (e.g. offline testing), skip
    return { drained: 0, requeued: 0, deferred: 0 };
  }

  const events: QueuedEvent[] = [];

  try {
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
  } catch (popErr) {
    // Redis blip mid-pop: everything popped so far has already been removed
    // from the queue by rpop — the only way to not lose it is to push it
    // straight back before returning.
    console.error(
      `[cron-accrue] rpop failed after popping ${events.length} events this batch — re-queueing them:`,
      popErr,
    );
    const pushedBack = await safeRequeue(redis, events, 'rpop failure mid-batch');
    return { drained: 0, requeued: pushedBack, deferred: 0 };
  }

  if (events.length === 0) return { drained: 0, requeued: 0, deferred: 0 };

  // Group by campaign for charging
  const byCampaign = new Map<string, QueuedEvent[]>();
  for (const ev of events) {
    if (ev.type !== 'impression') continue;
    const list = byCampaign.get(ev.campaignId) ?? [];
    list.push(ev);
    byCampaign.set(ev.campaignId, list);
  }

  let requeued = 0;
  let deferred = 0;
  // Not-yet-resolved campaigns for this batch — see the safety-net note in
  // the docstring above. Deleted from as each campaign is resolved one way
  // or another; whatever remains when the loop exits (normally OR via an
  // uncaught throw) gets pushed back in `finally`.
  const pending = new Map(byCampaign);

  try {
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
      // Declared out here so the outer catch can re-queue the right subset:
      // once the deferral block below has pushed the small publishers' events
      // back, only these may go back again.
      let settleableEvents = evs;
      try {
        const cmpSnap = await db
          .collection(COLLECTIONS.campaigns)
          .doc(campaignId)
          .withConverter(campaignConverter)
          .get();

        if (!cmpSnap.exists) {
          pending.delete(campaignId); // no such campaign — nothing to bill or requeue
          continue;
        }
        const cmp = cmpSnap.data()!;
        if (cmp.budget.mode !== 'cpm_capped') {
          pending.delete(campaignId); // not a mode accrual bills — nothing to do
          continue;
        }

        // Count impressions per publisher (flat CPM, so price is uniform).
        const countByPublisher = new Map<string, number>();
        for (const ev of evs) {
          countByPublisher.set(ev.publisherId, (countByPublisher.get(ev.publisherId) ?? 0) + 1);
        }

        // Gross per publisher = round(cpm * count / 1000); campaign charge = sum (conserves money).
        //
        // A gross below MIN_SPLITTABLE_GROSS_ISK cannot be split into a
        // publisher credit and a platform fee that are both whole króna, so
        // it is not billed at all this run — its events go back on the queue
        // and accumulate until they are worth splitting. Crediting the
        // publisher the full gross instead would silently waive the platform
        // fee, and on a network of small publishers those tiny batches are
        // most of the volume. Deferring the whole line (charge, credit and
        // fee together) is what keeps `checkCampaign`'s money-conservation
        // invariant intact: credits + fees must equal charges exactly, so
        // nothing may be charged before it can also be credited.
        // A campaign that is no longer running can never accumulate more
        // impressions, so deferring its residue would strand it on the queue
        // forever: popped, re-deferred and re-pushed every 15 minutes, the
        // publisher never paid and `events:accrual` growing by one residue
        // per ended campaign. Settle whatever it has instead and let
        // creditPublisher waive the sub-króna fee.
        const campaignStillRunning =
          cmp.status === 'active' && cmp.schedule.endsAt.getTime() > Date.now();

        const grossByPublisher = new Map<string, number>();
        const deferredPublishers = new Set<string>();
        let totalCharge = 0;
        for (const [publisherId, count] of countByPublisher) {
          const gross = Math.round((FLAT_CPM_ISK * count) / 1000);
          if (gross <= 0) continue;
          if (gross < MIN_SPLITTABLE_GROSS_ISK && campaignStillRunning) {
            deferredPublishers.add(publisherId);
            continue;
          }
          grossByPublisher.set(publisherId, gross);
          totalCharge += gross;
        }

        // Everything downstream — the two explicit re-queue sites, the
        // dropped-events forensic record, and `pending` — must work off the
        // settleable subset, never `evs`. The deferred events have already
        // been pushed back by the time those run, and pushing them a second
        // time bills the advertiser for impressions that never happened and
        // pays the publisher for them twice. Conservation still holds in that
        // case, so reconciliation cannot catch it.
        if (deferredPublishers.size > 0) {
          const deferredEvents = evs.filter((ev) => deferredPublishers.has(ev.publisherId));
          settleableEvents = evs.filter((ev) => !deferredPublishers.has(ev.publisherId));
          const pushed = await safeRequeue(
            redis,
            deferredEvents,
            `gross below ${MIN_SPLITTABLE_GROSS_ISK} ISK for ${deferredPublishers.size} publisher(s) on ${campaignId}`,
          );
          deferred += pushed;
          if (pushed === deferredEvents.length) {
            // Only shrink `pending` once the push actually landed. If it
            // didn't, leaving the full batch in `pending` lets the outer
            // catch or the `finally` net have another go rather than dropping
            // the small publishers' revenue.
            if (settleableEvents.length > 0) {
              pending.set(campaignId, settleableEvents);
            } else {
              pending.delete(campaignId);
            }
          } else {
            settleableEvents = evs;
          }
        }

        if (totalCharge > 0) {
          try {
            await chargeCampaign(cmp.advertiserId, campaignId, totalCharge);
            charged = true;
            pending.delete(campaignId); // charged — must never be re-queued from here on
            // Charging succeeded — clear any consecutive-failure streak this
            // campaign had built up. Best-effort: if this throws, it's a
            // post-charge failure and the outer catch's `charged` branch below
            // already handles it (log + continue, never re-queue).
            try {
              await redis.del(`${ACCRUAL_FAIL_PREFIX}${campaignId}`);
            } catch (clearErr) {
              console.error(
                `[cron-accrue] failed to clear accrual-fail counter for ${campaignId}:`,
                clearErr,
              );
            }
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
            // Explicitly pause the campaign in Firestore and push cache to
            // Redis to stop any leak. Guarded in its own try/catch (MINOR-4):
            // this campaign was never charged, so if the pause write itself
            // throws, letting that escape to the outer catch would run it
            // through the consecutive-failure counter/threshold machinery —
            // built for a DIFFERENT failure mode — for a campaign that's
            // simply out of money and will keep failing the exact same way
            // every run until that counter happens to cross the threshold.
            // Handle it right here instead.
            let paused = false;
            try {
              await db.collection(COLLECTIONS.campaigns).doc(campaignId).update({
                status: 'paused',
              });
              await pushCacheForCampaign(campaignId);
              paused = true;
            } catch (pauseErr) {
              console.error(
                `[cron-accrue] failed to pause ${campaignId} after insufficient balance — leaving its events queued for retry:`,
                pauseErr,
              );
            }
            pending.delete(campaignId);
            if (!paused) {
              // Pause failed — the campaign stays active and may keep serving
              // unbilled impressions. It was never charged, so putting these
              // events straight back is safe and correct: the next run gets
              // another shot at charging (or successfully pausing) it.
              const pushed = await safeRequeue(
                redis,
                settleableEvents,
                `insufficient-balance pause failed for ${campaignId}`,
              );
              requeued += pushed;
            }
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
        } else {
          // Nothing settleable this run. Any deferred events were already
          // re-queued above and removed from `pending`; what's left here is a
          // campaign whose impressions all rounded to zero gross.
          pending.delete(campaignId);
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
          pending.delete(campaignId);
          continue;
        }
        // Unexpected failure (not the handled insufficient-funds path above,
        // which already `continue`s before reaching here) that happened
        // BEFORE the charge went through — this campaign's raw events are
        // safe to put back for the next run to retry, UNLESS this campaign has
        // now failed too many times in a row (see ACCRUAL_FAIL_THRESHOLD).
        const failKey = `${ACCRUAL_FAIL_PREFIX}${campaignId}`;
        let failCount = 1;
        try {
          failCount = await redis.incr(failKey);
          await redis.expire(failKey, ACCRUAL_FAIL_TTL_SECONDS);
        } catch (counterErr) {
          console.error(
            `[cron-accrue] failed to update accrual-fail counter for ${campaignId}:`,
            counterErr,
          );
        }

        if (failCount >= ACCRUAL_FAIL_THRESHOLD) {
          console.error(
            `[cron-accrue] ${campaignId} failed to charge ${failCount} times in a row — attempting to pause:`,
            err,
          );
          // The drop-and-don't-re-queue decision below is only safe if the
          // pause ACTUALLY happened. If it didn't, the campaign is still
          // active and will keep serving unbilled — dropping these events too
          // would under-bill the advertiser AND leave the publisher never
          // credited for real, permanently, on top of that. So `paused` gates
          // both the alert wording (never tell ops "paused" when it wasn't)
          // and whether we fall through to the normal re-queue path.
          let paused = false;
          try {
            await db.collection(COLLECTIONS.campaigns).doc(campaignId).update({
              status: 'paused',
            });
            await pushCacheForCampaign(campaignId);
            paused = true;
          } catch (pauseErr) {
            console.error(
              `[cron-accrue] failed to pause ${campaignId} after sustained accrual failures:`,
              pauseErr,
            );
          }

          if (paused) {
            // The campaign is paused and its events are about to be dropped
            // deliberately (never charged, never re-queued). That's still real
            // money and real publisher earnings disappearing with no ledger
            // trace for reconciliation to catch — so before dropping, record
            // exactly what's being discarded: how many impressions, and how
            // many per publisher, so ops has a forensic record to manually
            // credit from if it comes to that. Logged to console AND put in
            // the alert body itself, not just one or the other.
            // Only the settleable events are actually being dropped here;
            // any deferred ones went back on the queue earlier and will be
            // billed by a later run. Counting them as lost would send ops
            // chasing a manual credit for a publisher who is about to be
            // paid normally.
            const impressionsByPublisher = new Map<string, number>();
            for (const ev of settleableEvents) {
              impressionsByPublisher.set(
                ev.publisherId,
                (impressionsByPublisher.get(ev.publisherId) ?? 0) + 1,
              );
            }
            const discardedEvidence = {
              campaignId,
              discardedEvents: settleableEvents.length,
              impressionsByPublisher: Object.fromEntries(impressionsByPublisher),
            };
            console.error(
              '[cron-accrue] discarding unbilled events after pausing a campaign — forensic record:',
              JSON.stringify(discardedEvidence),
            );
            const breakdown = [...impressionsByPublisher.entries()]
              .map(([publisherId, count]) => `${publisherId}: ${count}`)
              .join(', ');

            await alertOps(
              `Herferð ${campaignId} sett í bið — endurteknar villur við innheimtu`,
              `Innheimta fyrir herferð ${campaignId} hefur mistekist ${failCount} sinnum í röð (síðasta villa: ${String(err).slice(0, 300)}). Herferðin var sjálfkrafa sett í bið til að stöðva ófrágengnar birtingar — skoðaðu Vercel logs og /api/cron-diagnostics. ${evs.length} óinnheimtar birtingar úr þessari lotu týnast núna (aldrei innheimtar hjá auglýsanda né greiddar útgefanda) — sundurliðun eftir útgefanda: ${breakdown}.`,
            );
            try {
              await redis.del(failKey);
            } catch {
              /* best effort — a stale count just means one extra failure is
               * needed before the next pause decision, not a correctness issue */
            }
            pending.delete(campaignId);
            continue; // paused — safe to drop this batch's events deliberately
          }

          // Pause failed too — the campaign is still active and will keep
          // serving. Do NOT drop these events (nothing may be lost when we
          // failed to stop the campaign) and do NOT clear the counter (so the
          // very next run retries the pause immediately instead of waiting
          // for three more fresh failures). Fall through to the normal
          // re-queue below instead of `continue`ing.
          await alertOps(
            `VILLA: Ekki tókst að setja herferð ${campaignId} í bið — hún er ENN VIRK`,
            `Innheimta fyrir herferð ${campaignId} hefur mistekist ${failCount} sinnum í röð OG sjálfvirk tilraun til að setja herferðina í bið mistókst líka (síðasta innheimtuvilla: ${String(err).slice(0, 300)}). Herferðin er ENN VIRK og gæti verið að birtast án innheimtu núna — settu hana í bið handvirkt strax og skoðaðu Vercel logs og /api/cron-diagnostics.`,
          );
        }

        console.warn(`[cron-accrue] re-queueing ${evs.length} events for ${campaignId}:`, err);
        const pushed = await safeRequeue(
          redis,
          settleableEvents,
          `unexpected charge failure for ${campaignId}`,
        );
        requeued += pushed;
        pending.delete(campaignId);
      }
    }
  } finally {
    // Safety net: any campaign still in `pending` here was never resolved
    // by the loop above — either because processing of it hasn't started
    // yet (an earlier campaign's handling threw in some way none of the
    // per-campaign catches above caught) or, defensively, because a future
    // code change adds a new throw site nobody remembered to guard. Either
    // way its events were already popped out of Redis by rpop and were
    // never charged, so the only safe outcome is to push them straight
    // back. Charged campaigns are never in `pending` by this point (removed
    // the moment `chargeCampaign` resolved), so this can never double-bill.
    if (pending.size > 0) {
      for (const [campaignId, evs] of pending) {
        const pushed = await safeRequeue(
          redis,
          evs,
          `batch aborted before resolving ${campaignId}`,
        );
        requeued += pushed;
      }
    }
  }

  return { drained: events.length, requeued, deferred };
}

/** Drain up to `batchSize` events and process them. Returns count drained. */
export async function drainAndAccrue(batchSize = 500): Promise<number> {
  const res = await drainBatch(batchSize);
  return res.drained;
}

/** Wall-clock budget for a whole drainAndAccrueAll run, leaving headroom
 *  under the 60s Vercel `maxDuration` on `api/cron-accrue.js` (see
 *  apps/api/vercel.json). A batch already in flight is allowed to finish —
 *  only STARTING a new one is gated on the deadline — so the real worst-case
 *  wall time is this budget plus one batch's duration, not a hard cutoff. */
const DEFAULT_DRAIN_DEADLINE_MS = 45_000;

/** Dedupe key (see ops-alerts.ts `alreadyAlerted`) for the "this run billed
 *  nothing net" alert below — reused across runs so a persistent stall
 *  pages ops once per 6h window, not every 15-minute cron tick. */
const ACCRUAL_ZERO_PROGRESS_ALERT_KEY = 'accrual-zero-progress';

/**
 * Loop `drainBatch` until the queue is exhausted, a batch makes no forward
 * progress (everything in it got re-queued), `maxBatches` is hit, or the
 * wall-clock deadline passes — the latter two are both safety valves against
 * a runaway loop within a single cron invocation, one bounding total batch
 * count and the other bounding total time (Vercel kills the function at
 * `maxDuration` regardless of how much queue is left, taking the in-flight
 * batch's already-popped-but-not-yet-requeued events with it — the deadline
 * exists so the loop stops itself first, with everything either charged or
 * safely back on the queue, instead of Vercel doing it mid-batch).
 * `batches` is the true number of `drainBatch` calls made; `capped` tells an
 * operator whether the run stopped because it hit the batch-count safety
 * valve with work still left (truncated); `timedOut` tells them it stopped
 * because it ran out of wall-clock time instead — both can leave queue depth
 * above zero, but for different reasons an operator would investigate
 * differently (a slow individual batch vs. simply more volume than 20
 * batches of 500 can cover). `netDrained` is `drained - requeued`: the
 * number of events this run actually made billing progress on, since
 * `drained` alone counts events that were popped and then pushed straight
 * back (net zero, not overstated as "processed").
 */
export async function drainAndAccrueAll(opts?: {
  batchSize?: number;
  maxBatches?: number;
  /** Wall-clock budget in ms for the whole run. Defaults to ~45s. */
  deadlineMs?: number;
  /** Injectable clock so tests can exercise the deadline without waiting. */
  now?: () => number;
}): Promise<{
  drained: number;
  netDrained: number;
  /** Events held back because their gross was not yet splittable. */
  deferred: number;
  batches: number;
  requeued: number;
  capped: boolean;
  timedOut: boolean;
}> {
  const batchSize = opts?.batchSize ?? 500;
  const maxBatches = opts?.maxBatches ?? 20;
  const now = opts?.now ?? Date.now;
  const deadlineMs = opts?.deadlineMs ?? DEFAULT_DRAIN_DEADLINE_MS;
  const deadlineAt = now() + deadlineMs;

  let drained = 0;
  let requeued = 0;
  let deferred = 0;
  let batches = 0;
  // True only when maxBatches cut the run short while it was still making
  // full-batch progress — i.e. there may be more work left in the queue than
  // this run got to. A clean finish (queue ran dry, or a batch stalled with
  // zero net progress) is NOT "capped", even if it happens to be the last
  // iteration the loop would have allowed anyway.
  let capped = false;
  // True only when the wall-clock deadline is why the loop stopped starting
  // new batches, as opposed to the queue running dry, a stalled batch, or
  // maxBatches. Checked BEFORE starting each batch, never mid-batch — an
  // in-flight batch always finishes and its results are always counted.
  let timedOut = false;
  while (batches < maxBatches) {
    if (now() >= deadlineAt) {
      timedOut = true;
      break;
    }
    const res = await drainBatch(batchSize);
    batches++; // count the call that actually happened, not a loop-increment guess
    drained += res.drained;
    requeued += res.requeued;
    deferred += res.deferred;
    // Stop when the queue yielded less than a full batch (empty), or when a
    // batch made no forward progress (everything went back — retrying in
    // this run would just spin on the same failure, and re-popping deferred
    // events would only defer them again).
    if (res.drained < batchSize || res.drained === res.requeued + res.deferred) break;
    if (batches === maxBatches) capped = true;
  }

  const netDrained = drained - requeued - deferred;
  // A run that popped events but billed nothing net — every one of them
  // ended up back on the queue — is exactly the failure mode a heartbeat
  // alone can't see: the cron ran, didn't throw, and will happily record a
  // green heartbeat while genuinely making zero progress (e.g. a sustained
  // Firestore/Redis blip hitting every campaign this run touched).
  //
  // Deferrals are excluded deliberately. A run where every publisher was
  // below the splittable threshold also bills nothing, but that is normal
  // operation on a network of small publishers — paging ops for it would
  // turn this alert into noise on exactly the signal it exists to carry.
  if (netDrained === 0 && drained > 0 && requeued > 0) {
    if (!(await alreadyAlerted(ACCRUAL_ZERO_PROGRESS_ALERT_KEY))) {
      await alertOps(
        'Innheimta skilaði engu — allar birtingar fóru aftur í biðröð',
        `Þessi keyrsla á cron-accrue tók ${drained} atburði úr events:accrual en gat ekki innheimt neinn þeirra — öllum var skilað aftur í biðröðina (${batches} lotur). Cronið keyrði og skráði heartbeat eðlilega, svo ekkert annað kerfi mun benda á þetta. Skoðaðu Vercel logs og /api/cron-diagnostics.`,
      );
    }
  }

  return { drained, netDrained, batches, requeued, deferred, capped, timedOut };
}
