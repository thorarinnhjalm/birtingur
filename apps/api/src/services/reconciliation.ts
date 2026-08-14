import type { DocumentData } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  campaignConverter,
  ledgerEntryConverter,
  payoutConverter,
} from '@ada/shared/firestore';
import { db } from '../lib/firebase.js';
import { getRedis, isRedisConfigured } from '../lib/redis.js';
import { alertOps } from './ops-alerts.js';
import { MIN_PAYOUT_ISK } from '@ada/shared';
import type { Campaign, LedgerEntry } from '@ada/shared';

/**
 * Daily read-only cross-check of the three money representations:
 *   1. the append-only ledger (source of truth),
 *   2. campaign.budget.remainingIsk in Firestore (the enforced spend cap), and
 *   3. the budget:{id} Redis counter (the serve-time gate).
 *
 * Also runs a fourth, non-money check: the emitted-vs-recorded event pipeline
 * (see checkEventPipeline below) — the independent second count that catches
 * events serving queued but the aggregator never wrote.
 *
 * This service NEVER mutates state — it only reads and reports. Findings are
 * surfaced to ops via alertOps(); fixing drift is a manual/human follow-up.
 */

export type ReconciliationFindingKind =
  | 'campaign_spend_mismatch'
  | 'money_conservation_mismatch'
  | 'advertiser_mirror_mismatch'
  | 'redis_budget_overseeded'
  | 'stale_agent_pending_campaign'
  | 'event_pipeline_loss'
  | 'publisher_negative_balance'
  | 'publisher_stuck_payable'
  | 'publisher_stale_payout_doc'
  | 'implausible_click_rate'
  | 'platform_click_rate_spike';

export interface ReconciliationFinding {
  kind: ReconciliationFindingKind;
  entityId: string;
  detail: string;
  expected: number;
  actual: number;
}

export interface ReconciliationReport {
  findings: ReconciliationFinding[];
  counts: {
    campaignsChecked: number;
    advertisersChecked: number;
    redisBudgetsChecked: number;
    eventPipelineHoursChecked: number;
    publisherStatDaysChecked: number;
  };
  generatedAt: string;
}

async function ledgerEntriesForRelatedId(relatedId: string): Promise<LedgerEntry[]> {
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('relatedId', '==', relatedId)
    .withConverter(ledgerEntryConverter)
    .get();
  return snap.docs.map((d) => d.data());
}

async function ledgerEntriesForAdvertiser(advertiserId: string): Promise<LedgerEntry[]> {
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('party.type', '==', 'advertiser')
    .where('party.id', '==', advertiserId)
    .withConverter(ledgerEntryConverter)
    .get();
  return snap.docs.map((d) => d.data());
}

/**
 * Checks 1 & 2 for a single campaign, sharing the one ledger query.
 *
 * Campaign creation/increase never debits the ledger — only real accrual
 * charges do (`campaign_charge` entries, see chargeCampaign in
 * services/wallet.ts) — so `budget.remainingIsk` is a committed-funds HOLD,
 * not money taken out of the wallet. Releasing an unspent hold (e.g. a
 * rejected sole creative in propagateCreativeChange, services/approvals.ts,
 * or the expiry sweep in services/campaigns.ts) is therefore just a status
 * change to `completed` plus zeroing `remainingIsk` — it records NO ledger
 * entry (refundCampaign must not be called for it; see the comment on
 * refundCampaign in services/wallet.ts for why that would mint money).
 *
 * That means `budget.totalIsk - budget.remainingIsk` ("released from
 * budget") only has to match `sum(campaign_charge)` while `remainingIsk` is
 * still positive — the only mechanism that can move it down from a positive
 * value is accrual, so any mismatch there is genuine drift. Once
 * `remainingIsk` reaches exactly 0 it's ambiguous from ledger data alone:
 * that could mean "fully spent via accrual" (released == charged, no
 * finding either way) or "released by rejection/expiry with less than full
 * spend" (released > charged, by design, not a bug). We only enforce the
 * strict equality while remainingIsk is still positive.
 */
async function checkCampaign(campaign: Campaign, findings: ReconciliationFinding[]): Promise<void> {
  const entries = await ledgerEntriesForRelatedId(campaign.id);

  // campaign_charge entries are stored with negative amountIsk; negate to get
  // the positive gross amount actually charged against this campaign.
  const chargesSum = -entries
    .filter((e) => e.type === 'campaign_charge')
    .reduce((acc, e) => acc + e.amountIsk, 0);

  const releasedFromBudget = campaign.budget.totalIsk - campaign.budget.remainingIsk;

  if (campaign.budget.remainingIsk > 0 && releasedFromBudget !== chargesSum) {
    findings.push({
      kind: 'campaign_spend_mismatch',
      entityId: campaign.id,
      detail:
        'budget.totalIsk - budget.remainingIsk does not match the sum of campaign_charge ' +
        'ledger entries for this campaign',
      expected: chargesSum,
      actual: releasedFromBudget,
    });
  }

  // Money conservation: creditPublisher always writes a publisher_credit and a
  // platform_fee entry together, splitting one gross amount, and drainAndAccrue
  // charges the campaign the sum of those grosses — so summing both entry
  // types back up must reproduce the gross charged, exactly, campaign by
  // campaign. Refunds don't participate here: rejections zero the budget
  // without ever crediting a publisher for the un-served remainder.
  const creditsAndFees = entries
    .filter((e) => e.type === 'publisher_credit' || e.type === 'platform_fee')
    .reduce((acc, e) => acc + e.amountIsk, 0);

  if (creditsAndFees !== chargesSum) {
    findings.push({
      kind: 'money_conservation_mismatch',
      entityId: campaign.id,
      detail:
        'sum(publisher_credit) + sum(platform_fee) for this campaign does not equal the gross ' +
        'campaign_charge sum — money is not conserved',
      expected: chargesSum,
      actual: creditsAndFees,
    });
  }
}

/** Check 3: the advertiser's walletBalanceIsk mirror vs the real ledger sum. */
async function checkAdvertiserMirror(
  advertiserId: string,
  raw: DocumentData,
  findings: ReconciliationFinding[],
): Promise<void> {
  const entries = await ledgerEntriesForAdvertiser(advertiserId);
  const ledgerSum = entries.reduce((acc, e) => acc + e.amountIsk, 0);
  const mirror: number | undefined = raw?.walletBalanceIsk;

  if (mirror === undefined || mirror === null) {
    if (entries.length > 0) {
      findings.push({
        kind: 'advertiser_mirror_mismatch',
        entityId: advertiserId,
        detail: 'advertiser has ledger entries but no walletBalanceIsk mirror field',
        expected: ledgerSum,
        actual: 0,
      });
    }
    // No mirror and no ledger entries: a brand new advertiser, not a finding.
    return;
  }

  if (mirror !== ledgerSum) {
    findings.push({
      kind: 'advertiser_mirror_mismatch',
      entityId: advertiserId,
      detail: "walletBalanceIsk mirror does not match the sum of this advertiser's ledger entries",
      expected: ledgerSum,
      actual: mirror,
    });
  }
}

/**
 * Check 4: the Redis budget:{id} serve-time counter must never exceed
 * Firestore's budget.remainingIsk — that would mean serving could still spend
 * money that the enforced cap in Firestore no longer accounts for. A missing
 * key or a lower value is expected drift (fail-closed behavior / un-accrued
 * impressions between cron runs) and is not reported.
 */
async function checkRedisBudgets(
  campaigns: Campaign[],
  findings: ReconciliationFinding[],
): Promise<number> {
  const redis = getRedis();
  const candidates = campaigns.filter(
    (c) => c.status !== 'completed' && c.budget.mode === 'cpm_capped',
  );

  let checked = 0;
  for (const campaign of candidates) {
    checked++;
    const raw = await redis.get<number | string>(`budget:${campaign.id}`);
    if (raw == null) continue;
    const value = Number(raw);
    if (value > campaign.budget.remainingIsk) {
      findings.push({
        kind: 'redis_budget_overseeded',
        entityId: campaign.id,
        detail:
          'Redis budget:{id} serve-time counter is greater than Firestore budget.remainingIsk ' +
          '— an over-seeded counter risks over-serving beyond the enforced cap',
        expected: campaign.budget.remainingIsk,
        actual: value,
      });
    }
  }
  return checked;
}

const STALE_AGENT_PENDING_DAYS = 7;

/**
 * Check 5: a campaign still `pending_approval` with `pendingReason:
 * 'agent_purchase'` after STALE_AGENT_PENDING_DAYS days is a sign the owner
 * may never have seen (or acted on) the approval notification — the
 * in-app/email notice fires once at create time (createCampaign,
 * services/campaigns.ts) with no follow-up reminder. This is a read-only
 * flag for ops to manually nudge the owner; it never mutates the campaign
 * (approve/reject stay owner-only — see approveAgentPurchaseCampaign /
 * rejectAgentPurchaseCampaign). Campaigns without a createdAt (written before
 * that field existed) are skipped rather than treated as infinitely stale.
 */
function checkStaleAgentPendingCampaigns(
  campaigns: Campaign[],
  findings: ReconciliationFinding[],
  now: Date = new Date(),
): void {
  for (const campaign of campaigns) {
    // Fix 1d (pendingReason lifecycle): the tag alone isn't sufficient — a
    // campaign that already left pending_approval (completed via
    // creative-rejection or the expiry sweep) must not keep generating a
    // daily "stale agent-pending" alert just because a pendingReason tag
    // survived on it. Matches the invariant enforced everywhere else the tag
    // is written: "pendingReason exists iff status is pending_approval".
    if (campaign.pendingReason !== 'agent_purchase' || campaign.status !== 'pending_approval') {
      continue;
    }
    if (!campaign.createdAt) continue;
    const ageDays = (now.getTime() - campaign.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > STALE_AGENT_PENDING_DAYS) {
      findings.push({
        kind: 'stale_agent_pending_campaign',
        entityId: campaign.id,
        detail:
          `Campaign has been pending_approval with pendingReason 'agent_purchase' for ` +
          `${Math.floor(ageDays)} day(s) — the owner may never have seen the approval ` +
          'notification; consider a manual nudge',
        expected: STALE_AGENT_PENDING_DAYS,
        actual: Math.floor(ageDays),
      });
    }
  }
}

// Mirrors serving's emittedCounterKey (apps/serving/src/lib/analytics.ts) and the
// aggregator's recordedCounterKey (apps/api/src/services/stats-aggregator.ts) —
// same YYYYMMDDHH (UTC) key shape, duplicated here rather than imported across
// module boundaries (same convention as the aggregator's own duplicate).
function hourKeyUTC(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    String(d.getUTCHours()).padStart(2, '0')
  );
}

const EVENT_PIPELINE_LOOKBACK_HOURS = 24;
// Events queue in Redis and drain on the hourly cron-aggregate cadence, plus
// serving retries/late writes — an hour that's still within its own window
// can legitimately show recorded << emitted just because the aggregator
// hasn't drained it yet. Two hours covers a missed/late aggregate run without
// crying wolf on in-flight data (2026-08-09 design, Part 3).
const EVENT_PIPELINE_SETTLE_HOURS = 2;
const EVENT_PIPELINE_MIN_ABS_TOLERANCE = 50;
const EVENT_PIPELINE_REL_TOLERANCE = 0.01;

/**
 * Check 6: emitted-vs-recorded event pipeline. Serving increments
 * `emitted:{hour}` as it queues each event (every type); the aggregator
 * increments `recorded:{hour}` as it writes each event's stats. Absence of
 * the `emitted` counter is NOT evidence of loss — it means the bucket
 * expired (7-day TTL) or nothing ever emitted for that hour — so it is
 * skipped, never treated as zero-recorded. A missing `recorded` counter
 * (the key never created at all) DOES count as zero: the aggregator ran
 * for that hour's neighbours but produced nothing for this one, which is a
 * real signal.
 *
 * Strictly read-only: only redis.get, never a write.
 */
async function checkEventPipeline(findings: ReconciliationFinding[], now: Date): Promise<number> {
  if (!isRedisConfigured()) return 0;
  const redis = getRedis();

  const hourMs = 60 * 60 * 1000;
  const settleCutoffMs = now.getTime() - EVENT_PIPELINE_SETTLE_HOURS * hourMs;

  let checked = 0;
  for (let i = 0; i < EVENT_PIPELINE_LOOKBACK_HOURS; i++) {
    const bucketMs = settleCutoffMs - i * hourMs;
    const hk = hourKeyUTC(new Date(bucketMs));

    const emittedRaw = await redis.get<number | string>(`emitted:${hk}`);
    if (emittedRaw == null) continue; // absent emitted counter: skip, not zero.
    const emitted = Number(emittedRaw);
    checked++;

    const recordedRaw = await redis.get<number | string>(`recorded:${hk}`);
    const recorded = recordedRaw == null ? 0 : Number(recordedRaw);

    const tolerance = Math.max(
      EVENT_PIPELINE_MIN_ABS_TOLERANCE,
      emitted * EVENT_PIPELINE_REL_TOLERANCE,
    );
    if (recorded < emitted - tolerance) {
      findings.push({
        kind: 'event_pipeline_loss',
        entityId: hk,
        detail:
          `emitted:${hk} counted ${emitted} event(s) but recorded:${hk} shows only ${recorded} ` +
          '— events queued by serving may not be reaching the aggregator',
        expected: emitted,
        actual: recorded,
      });
    }
  }
  return checked;
}

/**
 * Check 9: a publisher-day whose click count cannot be explained by its
 * impression count.
 *
 * Every surface that displays CTR caps it at 100%, and that is correct — clicks
 * are not viewability-gated and impressions are (the pixel fires only once the
 * ad has been at least half visible for a continuous second, while the ad is
 * clickable the moment it renders), so a small sample can honestly show more
 * clicks than impressions and 140% on a publisher's dashboard reads as a broken
 * product rather than as the edge case it is.
 *
 * The price of that cap is that a click-inflation bug would now look identical
 * to a healthy day everywhere in the product: the number would simply sit at
 * 100% and nobody would ever see it move. This check is what makes the cap safe
 * — it reads the raw, uncapped ratio once a day and alerts ops, so the
 * displayed figure can stay sensible without the real one going unwatched.
 *
 * Two guards keep it from crying wolf, which would be worse than not having it:
 *
 * - `CLICK_RATE_MIN_CLICKS` — below this, the ratio is decided by a handful of
 *   uncounted impressions rather than by anything systemic. Seven clicks on
 *   five impressions is one visitor and an awkwardly placed slot.
 * - `CLICK_RATE_MAX_PLAUSIBLE` — display advertising runs near 0.1% CTR. A day
 *   at 20% is two hundred times the norm; an exceptional campaign at 2% is
 *   nowhere near it. The threshold is set where no honest explanation survives,
 *   deliberately not where behaviour merely looks unusual.
 *
 * A day with clicks and zero recorded impressions trips it too, and should: it
 * means a slot is being clicked while recording nothing, so the publisher earns
 * nothing for traffic that demonstrably converts.
 *
 * Read-only, like the rest of this service — it reads the settled stats docs the
 * hourly aggregator already wrote and never touches them.
 */
const CLICK_RATE_MIN_CLICKS = 20;
const CLICK_RATE_MAX_PLAUSIBLE = 0.2;
const CLICK_RATE_READ_CHUNK = 300;

// Check 10's window and volume floors. The floors exist so the comparison is
// only made where ordinary day-to-day variance cannot produce a multiple: below
// them the check says nothing rather than guessing.
const PLATFORM_BASELINE_DAYS = 7;
const PLATFORM_BASELINE_MIN_IMPRESSIONS = 50_000;
const PLATFORM_BASELINE_MIN_CLICKS = 50;
const PLATFORM_SPIKE_MIN_CLICKS = 20;
const PLATFORM_SPIKE_FACTOR = 3;

/** `YYYYMMDD` in UTC — the same key `dayKey()` in stats-aggregator.ts writes. */
function dayKeyUTC(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

async function checkPublisherClickRates(
  findings: ReconciliationFinding[],
  now: Date,
): Promise<number> {
  // Yesterday, never today: the aggregator runs hourly, so today's document is
  // a partial count by definition and its ratio means nothing until the day
  // closes. The cron runs at 05:00 UTC, well after yesterday's last hour has
  // been drained.
  const dk = dayKeyUTC(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const baselineKeys = Array.from({ length: PLATFORM_BASELINE_DAYS }, (_, i) =>
    dayKeyUTC(new Date(now.getTime() - (i + 2) * 24 * 60 * 60 * 1000)),
  );

  // Publisher-day stats live at `stats/publishers/{publisherId}/{dk}`, so each
  // publisher is a SUBCOLLECTION of the `stats/publishers` document. There is
  // no collection-group query for that shape (the collection id varies per
  // publisher), and listing the subcollections touches only publishers that
  // actually have stats — better than reading the whole publishers collection
  // and then missing on most of them.
  const publisherCollections = await db.doc(`${COLLECTIONS.stats}/publishers`).listCollections();

  // Read in batches, never one get() per publisher in a loop. That sequential
  // shape is exactly what killed cron-aggregate on 2026-08-11: a per-item round
  // trip is fine at ten items and blows the 60s function limit at a thousand,
  // and this list grows with every publisher who ever had a stat.
  const refs = publisherCollections.flatMap((col) => [
    col.doc(dk),
    ...baselineKeys.map((k) => col.doc(k)),
  ]);
  const snaps = [];
  for (let i = 0; i < refs.length; i += CLICK_RATE_READ_CHUNK) {
    const chunk = refs.slice(i, i + CLICK_RATE_READ_CHUNK);
    snaps.push(...(await db.getAll(...chunk)));
  }

  let checked = 0;
  let dayClicks = 0;
  let dayImpressions = 0;
  let baseClicks = 0;
  let baseImpressions = 0;

  for (const snap of snaps) {
    if (!snap.exists) continue;

    const publisherId = snap.ref.parent.id;
    const data = snap.data() ?? {};
    const impressions = Number(data.impressions ?? 0);
    const clicks = Number(data.clicks ?? 0);
    if (!Number.isFinite(impressions) || !Number.isFinite(clicks)) continue;

    if (snap.ref.id !== dk) {
      baseImpressions += impressions;
      baseClicks += clicks;
      continue;
    }

    checked++;
    dayImpressions += impressions;
    dayClicks += clicks;

    if (clicks < CLICK_RATE_MIN_CLICKS) continue;
    if (clicks <= impressions * CLICK_RATE_MAX_PLAUSIBLE) continue;

    // Formatted rather than divided into the message: impressions can be 0 here
    // and "Infinity%" in an ops email helps nobody.
    const rate =
      impressions > 0 ? `${((clicks / impressions) * 100).toFixed(1)}%` : 'no impressions counted';

    findings.push({
      kind: 'implausible_click_rate',
      entityId: `${publisherId}/${dk}`,
      detail:
        `Publisher ${publisherId} recorded ${clicks} click(s) against ${impressions} impression(s) ` +
        `on ${dk} (${rate}) — display CTR runs near 0.1%, so this is either inflated click ` +
        'counting or a slot that is being clicked while recording no impressions. Every ' +
        'dashboard caps CTR at 100%, so this will not be visible anywhere in the UI.',
      expected: impressions,
      actual: clicks,
    });
  }

  checkPlatformClickRateSpike(findings, dk, {
    dayClicks,
    dayImpressions,
    baseClicks,
    baseImpressions,
  });

  return checked;
}

/**
 * Check 10: the platform's own click rate against its recent past.
 *
 * Check 9 only catches the extreme. Its ceiling sits two hundred times above
 * the display norm, so a bug that merely doubles or triples every click sails
 * straight through it, and on a long-tail blog earning five clicks a day it
 * never even reaches the minimum sample. That is the failure this feature was
 * asked for in the first place: something starts counting each click three
 * times and every dashboard keeps showing a tidy, capped number.
 *
 * A counting bug is systemic, so the platform total is where it shows, and
 * pooling every publisher is also the only way the comparison means anything —
 * one small blog's daily rate swings by multiples on its own and a per
 * -publisher version of this would alert constantly.
 *
 * The expectation is a RATE applied to yesterday's impressions, not last week's
 * click count, so a publisher who doubles their traffic does not read as a
 * spike. The volume floors below are what keep the ratio out of the range where
 * ordinary variance produces multiples; with at least 20 clicks expected, a 3x
 * overshoot is far outside anything Poisson noise reaches.
 *
 * Absent history is "cannot compare", never a baseline of zero — otherwise the
 * first day after any deploy that widened the window would be an infinite
 * spike.
 */
function checkPlatformClickRateSpike(
  findings: ReconciliationFinding[],
  dk: string,
  totals: {
    dayClicks: number;
    dayImpressions: number;
    baseClicks: number;
    baseImpressions: number;
  },
): void {
  const { dayClicks, dayImpressions, baseClicks, baseImpressions } = totals;

  if (baseImpressions < PLATFORM_BASELINE_MIN_IMPRESSIONS) return;
  if (baseClicks < PLATFORM_BASELINE_MIN_CLICKS) return;
  if (dayImpressions <= 0) return;
  if (dayClicks < PLATFORM_SPIKE_MIN_CLICKS) return;

  const baselineRate = baseClicks / baseImpressions;
  const expected = Math.round(baselineRate * dayImpressions);
  if (expected <= 0) return;
  if (dayClicks < expected * PLATFORM_SPIKE_FACTOR) return;

  const pct = (r: number) => `${(r * 100).toFixed(3)}%`;
  findings.push({
    kind: 'platform_click_rate_spike',
    entityId: dk,
    detail:
      `Platform-wide click rate on ${dk} was ${pct(dayClicks / dayImpressions)} ` +
      `(${dayClicks} clicks on ${dayImpressions} impressions) against ${pct(baselineRate)} ` +
      `over the previous ${PLATFORM_BASELINE_DAYS} days — at that baseline ~${expected} clicks ` +
      `were expected, so this is ${(dayClicks / expected).toFixed(1)}x. A rate this far above ` +
      'its own recent past across every publisher at once points at click counting, not at ' +
      'advertiser performance. Every dashboard caps CTR at 100%, so this is invisible in the UI.',
    expected,
    actual: dayClicks,
  });
}

const PAYOUT_LEDGER_TYPES = ['publisher_credit', 'payout'] as const;

// cron-payouts runs "0 6 1 * *" (06:00 UTC on the 1st, apps/api/vercel.json)
// while cron-reconcile runs "0 5 * * *" (05:00 UTC daily) — an hour earlier.
// On the 1st, between those two times, check 7 below would see last month's
// credits already past currentMonthStart's cutoff but the payout run that's
// about to cover them hasn't executed yet, so basisAsOfLastRun looks stuck
// when it's actually just pending its scheduled run. PAYOUT_CRON_HOUR_UTC is
// that cutoff — check 7 is skipped for any "now" before it on the 1st.
const PAYOUT_CRON_HOUR_UTC = 6;

function thisMonthsPayoutRunHasHappened(now: Date): boolean {
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, PAYOUT_CRON_HOUR_UTC, 0, 0);
  return now.getTime() >= cutoff;
}

const STALE_PAYOUT_DOC_DAYS = 35;

/**
 * Checks 6, 7 & 8: publisher-side money health, computed independently from
 * services/payouts.ts. This deliberately DUPLICATES the payout basis
 * arithmetic (total credits minus all payout docs' netIsk) rather than
 * importing it — same philosophy as checkCampaign above: if a bug is ever
 * introduced into generateMonthlyPayouts' math, this check must not share
 * it, or reconciliation would silently agree with a broken payout run
 * instead of catching it.
 *
 * Read-only: only queries the ledger and payouts collections, never writes.
 *
 * `now` is injectable (defaults to the real clock) so tests can exercise the
 * check-7 pre-payout-run window deterministically instead of mocking global
 * time.
 */
async function checkPublisherBalances(
  findings: ReconciliationFinding[],
  now: Date = new Date(),
): Promise<void> {
  const ledgerSnap = await db
    .collection(COLLECTIONS.ledger)
    .where('type', 'in', [...PAYOUT_LEDGER_TYPES])
    .withConverter(ledgerEntryConverter)
    .get();

  const creditsByPublisher = new Map<string, LedgerEntry[]>();
  const payoutLedgerSumByPublisher = new Map<string, number>();
  for (const doc of ledgerSnap.docs) {
    const e = doc.data();
    if (e.party.type !== 'publisher') continue;
    if (e.type === 'publisher_credit') {
      const list = creditsByPublisher.get(e.party.id) ?? [];
      list.push(e);
      creditsByPublisher.set(e.party.id, list);
    } else {
      // 'payout' entries are stored negative (see LedgerEntrySchema) and
      // only ever get written by markPayoutCompleted — a payout doc still
      // 'pending'/'processing' has no ledger entry yet.
      payoutLedgerSumByPublisher.set(
        e.party.id,
        (payoutLedgerSumByPublisher.get(e.party.id) ?? 0) + e.amountIsk,
      );
    }
  }

  const payoutsSnap = await db.collection(COLLECTIONS.payouts).withConverter(payoutConverter).get();
  const paidNetByPublisher = new Map<string, number>();
  for (const doc of payoutsSnap.docs) {
    const p = doc.data();
    paidNetByPublisher.set(p.publisherId, (paidNetByPublisher.get(p.publisherId) ?? 0) + p.netIsk);

    // Check 8: a payout doc left 'pending'/'processing' for a long time is
    // money frozen silently — neither check 6 (no ledger 'payout' entry
    // yet, so balance looks fine) nor check 7 (paidNet already counts this
    // doc's netIsk, so the basis looks covered) notices it. periodEnd, not
    // createdAt, is the right clock: it's when the money was supposed to be
    // disbursed, and it's what markPayoutCompleted's disbursement is late
    // against.
    if (p.status === 'pending' || p.status === 'processing') {
      const ageDays = (now.getTime() - p.periodEnd.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > STALE_PAYOUT_DOC_DAYS) {
        findings.push({
          kind: 'publisher_stale_payout_doc',
          entityId: p.id,
          detail:
            `Payout doc for publisher ${p.publisherId} has been '${p.status}' for ` +
            `${Math.floor(ageDays)} day(s) past its periodEnd — money is held against this doc ` +
            'and excluded from the payable basis until it completes; check ops for a stuck bank transfer',
          expected: STALE_PAYOUT_DOC_DAYS,
          actual: Math.floor(ageDays),
        });
      }
    }
  }

  // Union of every publisher that has either a credit or a disbursed payout
  // ledger entry — a publisher with a 'payout' entry but no credits (which
  // should never legitimately happen) must still be checked for a negative
  // balance rather than silently skipped because it's absent from the
  // credits-keyed map.
  const publisherIds = new Set<string>([
    ...creditsByPublisher.keys(),
    ...payoutLedgerSumByPublisher.keys(),
  ]);

  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const payoutRunHappened = thisMonthsPayoutRunHasHappened(now);

  for (const publisherId of publisherIds) {
    const credits = creditsByPublisher.get(publisherId) ?? [];
    const totalCredits = credits.reduce((acc, e) => acc + e.amountIsk, 0);

    // Check 6: negative balance — the actual disbursed ledger 'payout'
    // entries (negative) outweigh total credits, e.g. VAT-hold drift or a
    // double disbursement. This is the same "money conservation" spirit as
    // checkCampaign's checks, applied to the publisher side of the ledger.
    const payoutLedgerSum = payoutLedgerSumByPublisher.get(publisherId) ?? 0;
    const balance = totalCredits + payoutLedgerSum;
    if (balance < 0) {
      findings.push({
        kind: 'publisher_negative_balance',
        entityId: publisherId,
        detail:
          'sum(publisher_credit) plus sum(payout ledger entries) is negative for this ' +
          'publisher — they appear to have been disbursed more than they earned',
        expected: 0,
        actual: balance,
      });
    }

    // Check 7: stuck payable — the basis AS OF the last payout run (credits
    // dated before this month, minus ALL payout docs' netIsk, any status —
    // mirrors generateMonthlyPayouts exactly, including that a still-
    // 'pending' doc already counts as spoken-for) was already at or above
    // MIN_PAYOUT_ISK, yet no payout doc covers it.
    //
    // This deliberately compares against the basis as of the LAST run, not
    // the basis as of right now: a publisher whose credits only cross the
    // minimum with THIS month's new credits isn't stuck — the run on the
    // 1st of next month will pay them correctly, same as it always has. An
    // earlier version of this check compared "now" instead (via the oldest
    // unpaid credit's date) and fired for any publisher with an old credit
    // anywhere in their history whenever paidNet was 0 — which is every
    // publisher who has never been paid, the common case — producing a
    // false alert for exactly our target long-tail publishers, who
    // routinely take more than one month to cross the floor even though
    // the payout cron behaved correctly every time it ran.
    const paidNet = paidNetByPublisher.get(publisherId) ?? 0;
    const creditsBeforeThisMonth = credits
      .filter((c) => c.createdAt < currentMonthStart)
      .reduce((sum, c) => sum + c.amountIsk, 0);
    const basisAsOfLastRun = creditsBeforeThisMonth - paidNet;
    // Skip entirely until this month's payout run has actually had its
    // chance to run — see PAYOUT_CRON_HOUR_UTC above. Without this, every
    // day between 05:00 and 06:00 UTC on the 1st fires a false alert for
    // every publisher about to be paid correctly an hour later.
    if (payoutRunHappened && basisAsOfLastRun >= MIN_PAYOUT_ISK) {
      findings.push({
        kind: 'publisher_stuck_payable',
        entityId: publisherId,
        detail:
          "unpaid publisher_credit basis (credits dated before this month's payout run, minus " +
          'all payout docs) was already at or above MIN_PAYOUT_ISK — the monthly payout cron ' +
          'should already have generated a payout for this publisher',
        expected: MIN_PAYOUT_ISK,
        actual: basisAsOfLastRun,
      });
    }
  }
}

function buildAlertMessage(findings: ReconciliationFinding[]): string {
  const shown = findings.slice(0, 10);
  const lines = shown.map((f) => {
    if (f.kind === 'event_pipeline_loss') {
      return `- [${f.kind}] ${f.entityId}: vænt ${f.expected} atburðir, raun ${f.actual} atburðir (${f.detail})`;
    }
    // Not krónur either: these two numbers are event counts, and a money alert
    // about no money is an alert nobody trusts the second time.
    if (f.kind === 'implausible_click_rate') {
      return `- [${f.kind}] ${f.entityId}: ${f.actual} smellir á móti ${f.expected} birtingum (${f.detail})`;
    }
    if (f.kind === 'platform_click_rate_spike') {
      return `- [${f.kind}] ${f.entityId}: ${f.actual} smellir, ${f.expected} væntanlegir (${f.detail})`;
    }
    return `- [${f.kind}] ${f.entityId}: vænt ${f.expected} kr., raun ${f.actual} kr. (${f.detail})`;
  });
  const more =
    findings.length > shown.length
      ? `\n... og ${findings.length - shown.length} atriði til viðbótar.`
      : '';
  return (
    `Dagleg afstemming (cron-reconcile) fann ${findings.length} misræmi í peningaflæði og/eða ` +
    `atburðaflæði (ledger, campaign.budget.remainingIsk, Redis budget-teljari, emitted-vs-recorded, ` +
    `smellir á móti birtingum). ` +
    `Fyrstu ${shown.length} atriðin:\n` +
    `${lines.join('\n')}${more}\n\n` +
    'Þetta er ekki sjálfkrafa leiðrétt — athugaðu Firestore ledger og /api/cron-diagnostics handvirkt.'
  );
}

export async function runReconciliation(now: Date = new Date()): Promise<ReconciliationReport> {
  const findings: ReconciliationFinding[] = [];

  const campaignsSnap = await db
    .collection(COLLECTIONS.campaigns)
    .withConverter(campaignConverter)
    .get();
  const campaigns = campaignsSnap.docs.map((d) => d.data());

  for (const campaign of campaigns) {
    await checkCampaign(campaign, findings);
  }
  checkStaleAgentPendingCampaigns(campaigns, findings);

  const advertisersSnap = await db.collection(COLLECTIONS.advertisers).get();
  for (const doc of advertisersSnap.docs) {
    await checkAdvertiserMirror(doc.id, doc.data(), findings);
  }

  let redisBudgetsChecked = 0;
  if (isRedisConfigured()) {
    redisBudgetsChecked = await checkRedisBudgets(campaigns, findings);
  }
  // checkEventPipeline has its own isRedisConfigured() guard (it returns 0
  // and pushes nothing when Redis isn't configured), matching how checkRedisBudgets
  // is gated above.
  const eventPipelineHoursChecked = await checkEventPipeline(findings, now);

  await checkPublisherBalances(findings, now);

  // Wrapped, unlike the money checks above it. Those run before anything is
  // alerted, so a throw here would take checks 1-8's already-collected findings
  // down with it: ops would get a generic "cron-reconcile failed" instead of
  // the drift that was actually detected, and nothing would retry until
  // tomorrow. Click rates are the least important thing this cron looks at and
  // must not be able to silence the most important.
  let publisherStatDaysChecked = 0;
  try {
    publisherStatDaysChecked = await checkPublisherClickRates(findings, now);
  } catch (err) {
    console.error('[reconciliation] click-rate checks failed, money checks unaffected:', err);
  }

  const report: ReconciliationReport = {
    findings,
    counts: {
      campaignsChecked: campaigns.length,
      advertisersChecked: advertisersSnap.size,
      redisBudgetsChecked,
      eventPipelineHoursChecked,
      publisherStatDaysChecked,
    },
    generatedAt: new Date().toISOString(),
  };

  if (findings.length > 0) {
    await alertOps(
      `Afstemming fann misræmi (${findings.length} atriði)`,
      buildAlertMessage(findings),
    );
  }

  return report;
}
