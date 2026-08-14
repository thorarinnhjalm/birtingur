import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  COLLECTIONS,
  campaignConverter,
  ledgerEntryConverter,
  payoutConverter,
} from '@ada/shared/firestore';
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  LedgerEntrySchema,
  PayoutSchema,
  MIN_PAYOUT_ISK,
} from '@ada/shared';
import type { Campaign, LedgerParty, LedgerEntryType, Payout } from '@ada/shared';
import { db } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { topUp, chargeCampaign, creditPublisher } from '../src/services/wallet';
import { appendLedger } from '../src/services/ledger';
import { isRedisConfigured } from '../src/lib/redis';
import type * as redisModule from '../src/lib/redis';

// checkEventPipeline (event_pipeline_loss) needs to read emitted:{hour} /
// recorded:{hour} counters from Redis, but there is no Redis emulator wired
// into `--only firestore` (see stats-aggregator.test.ts for the same
// constraint) — so getRedis() is mocked with a tiny in-memory fake here.
// isRedisConfigured() is kept real (via importOriginal) so the existing
// "skips gracefully when Redis is unconfigured" test below still exercises
// the genuine env-var-driven code path; the event-pipeline tests instead set
// those env vars themselves for the duration of the test.
const mockRedisStore = new Map<string, number>();

vi.mock('../src/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof redisModule>();
  return {
    ...actual,
    getRedis: () => ({
      get: async (key: string) => mockRedisStore.get(key) ?? null,
    }),
  };
});

import { runReconciliation } from '../src/services/reconciliation';
import { generateId } from '../src/lib/id';

// These tests run against the real Firestore emulator (not a mocked db), like
// tests/wallet-reservation.test.ts — reconciliation.ts issues genuine
// `where('relatedId', ...)` / `where('party.type', ...)` queries that a hand
// -rolled mock would have to reimplement anyway.
//
// Redis is deliberately kept unconfigured by default for the whole file: a
// developer's local .env.local may carry real Upstash credentials, and these
// tests must never depend on (or reach out to) a real Redis instance. Most
// tests exercise checks 1-3, which don't touch Redis at all; the dedicated
// check-4 test asserts the skip path explicitly. The event-pipeline tests
// (check 6) opt back into "configured" for their own duration via
// withRedisConfigured() below — isRedisConfigured() itself is real (see the
// vi.mock's importOriginal above), only getRedis() is faked, so this still
// exercises the genuine env-var gate.
const REDIS_ENV_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
] as const;
let savedRedisEnv: Record<string, string | undefined> = {};

/** Makes isRedisConfigured() return true for the duration of `fn`, then restores. */
async function withRedisConfigured<T>(fn: () => Promise<T>): Promise<T> {
  process.env.UPSTASH_REDIS_REST_URL = 'http://fake-redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
  try {
    return await fn();
  } finally {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

describe('runReconciliation', () => {
  beforeEach(async () => {
    savedRedisEnv = {};
    for (const key of REDIS_ENV_KEYS) {
      savedRedisEnv[key] = process.env[key];
      delete process.env[key];
    }
    mockRedisStore.clear();
    await clearFirestoreEmulator();
  });

  afterEach(() => {
    for (const key of REDIS_ENV_KEYS) {
      if (savedRedisEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedRedisEnv[key];
    }
  });

  async function seedAdvertiser(balanceIsk: number) {
    const adv = await createAdvertiser({
      ownerEmail: `adv-${Date.now()}-${Math.random().toString(36).slice(2)}@reconcile.test.is`,
      companyName: 'Reconcile Test ehf.',
      kennitala: '1234567890',
      vatNumber: '1',
    });
    if (balanceIsk > 0) {
      await topUp(adv.id, balanceIsk, `topup_${adv.id}`);
    }
    return adv;
  }

  /** Write a campaign doc directly so tests can set totalIsk/remainingIsk freely. */
  async function writeCampaign(
    id: string,
    advertiserId: string,
    totalIsk: number,
    remainingIsk: number,
    status: Campaign['status'] = 'active',
    extra: Partial<Pick<Campaign, 'pendingReason' | 'createdAt'>> = {},
  ): Promise<void> {
    const campaign: Campaign = {
      id,
      advertiserId,
      creativeIds: ['cre_dummy'],
      targeting: { categories: ['matur'] },
      schedule: {
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
      budget: { mode: 'cpm_capped', totalIsk, remainingIsk },
      status,
      ...extra,
    };
    await db
      .collection(COLLECTIONS.campaigns)
      .doc(id)
      .withConverter(campaignConverter)
      .set(campaign);
  }

  /** UTC YYYYMMDDHH bucket for a Date, matching hourKeyUTC in reconciliation.ts. */
  function hourKeyFor(d: Date): string {
    return (
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      String(d.getUTCDate()).padStart(2, '0') +
      String(d.getUTCHours()).padStart(2, '0')
    );
  }

  /** Seeds the fake Redis store's emitted:{hour} / recorded:{hour} counters directly. */
  async function seedCounters(
    hour: string,
    counts: { emitted?: number; recorded?: number },
  ): Promise<void> {
    if (counts.emitted !== undefined) mockRedisStore.set(`emitted:${hour}`, counts.emitted);
    if (counts.recorded !== undefined) mockRedisStore.set(`recorded:${hour}`, counts.recorded);
  }

  // Task 3 (publisher-side reconciliation checks) needs to seed raw ledger
  // 'publisher_credit'/'payout' entries with an explicit backdated createdAt,
  // and raw payout docs with an explicit status — direct writes, mirroring
  // tests/payouts.test.ts's appendLedgerAt/credit helpers, not the real
  // creditPublisher/markPayoutCompleted flows (which always stamp "now").
  async function creditPublisherLedger(publisherId: string, amountIsk: number, at: Date) {
    const entry = LedgerEntrySchema.parse({
      id: generateId('ldg'),
      party: { type: 'publisher', id: publisherId } satisfies LedgerParty,
      type: 'publisher_credit' satisfies LedgerEntryType,
      amountIsk,
      relatedId: 'cmp_reconcile_test',
      createdAt: at,
    });
    await db
      .collection(COLLECTIONS.ledger)
      .doc(entry.id)
      .withConverter(ledgerEntryConverter)
      .set(entry);
  }

  async function payoutLedgerEntry(
    publisherId: string,
    amountIsk: number,
    relatedId: string,
    at: Date,
  ) {
    const entry = LedgerEntrySchema.parse({
      id: generateId('ldg'),
      party: { type: 'publisher', id: publisherId } satisfies LedgerParty,
      type: 'payout' satisfies LedgerEntryType,
      amountIsk, // negative, per LedgerEntrySchema's sign refinement
      relatedId,
      createdAt: at,
    });
    await db
      .collection(COLLECTIONS.ledger)
      .doc(entry.id)
      .withConverter(ledgerEntryConverter)
      .set(entry);
  }

  async function writePayoutDoc(
    id: string,
    publisherId: string,
    netIsk: number,
    status: Payout['status'],
    periodEnd: Date = new Date(Date.UTC(2026, 6, 31, 23, 59, 59)),
  ) {
    const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    const payout: Payout = PayoutSchema.parse({
      id,
      publisherId,
      periodStart,
      periodEnd,
      grossIsk: netIsk,
      platformFeeIsk: 0,
      netIsk,
      vatIsk: 0,
      status,
      bankReference: status === 'completed' ? 'B-TEST' : '',
    });
    await db.collection(COLLECTIONS.payouts).doc(id).withConverter(payoutConverter).set(payout);
  }

  it('reports zero findings for a fully consistent seeded state', async () => {
    const adv = await seedAdvertiser(100_000);
    const campaignId = 'cmp_consistent';
    const charged = 20_000;

    // Real spend flow: charge the campaign (ledger + mirror), release the
    // matching budget, and credit the publisher the split gross.
    await chargeCampaign(adv.id, campaignId, charged);
    await writeCampaign(campaignId, adv.id, 50_000, 50_000 - charged);
    await creditPublisher('pub_consistent', campaignId, charged);

    const report = await runReconciliation();

    expect(report.findings).toEqual([]);
    expect(report.counts.campaignsChecked).toBeGreaterThanOrEqual(1);
    expect(report.counts.advertisersChecked).toBeGreaterThanOrEqual(1);
  });

  it('flags a campaign whose remainingIsk does not match ledger charges', async () => {
    const adv = await seedAdvertiser(100_000);
    const campaignId = 'cmp_corrupt_remaining';
    const charged = 20_000;

    await chargeCampaign(adv.id, campaignId, charged);
    // Corrupt: remainingIsk should be 50_000 - 20_000 = 30_000, but write 25_000.
    await writeCampaign(campaignId, adv.id, 50_000, 25_000);
    await creditPublisher('pub_corrupt', campaignId, charged);

    const report = await runReconciliation();

    const finding = report.findings.find(
      (f) => f.kind === 'campaign_spend_mismatch' && f.entityId === campaignId,
    );
    expect(finding).toBeDefined();
    expect(finding?.expected).toBe(charged);
    expect(finding?.actual).toBe(50_000 - 25_000);
  });

  it('flags broken money conservation (publisher_credit without a matching platform_fee)', async () => {
    const adv = await seedAdvertiser(100_000);
    const campaignId = 'cmp_broken_conservation';
    const charged = 20_000;

    await chargeCampaign(adv.id, campaignId, charged);
    await writeCampaign(campaignId, adv.id, 50_000, 50_000 - charged);
    // Corrupt: credit the publisher only the net amount, with no matching
    // platform_fee entry — simulates creditPublisher's atomic gross/fee split
    // losing its second write (e.g. a crash between the two appendLedger calls).
    const feeIsk = Math.round((charged * DEFAULT_PLATFORM_FEE_PERCENT) / 100);
    const netIsk = charged - feeIsk;
    await appendLedger({
      party: { type: 'publisher', id: 'pub_broken' },
      type: 'publisher_credit',
      amountIsk: netIsk,
      relatedId: campaignId,
    });

    const report = await runReconciliation();

    const finding = report.findings.find(
      (f) => f.kind === 'money_conservation_mismatch' && f.entityId === campaignId,
    );
    expect(finding).toBeDefined();
    expect(finding?.expected).toBe(charged);
    expect(finding?.actual).toBe(netIsk); // fee entry missing, so the sum is short
  });

  it('flags a stale advertiser wallet mirror', async () => {
    const adv = await seedAdvertiser(100_000);
    // Corrupt the mirror directly, bypassing syncMirror.
    await db.collection(COLLECTIONS.advertisers).doc(adv.id).update({ walletBalanceIsk: 999 });

    const report = await runReconciliation();

    const finding = report.findings.find(
      (f) => f.kind === 'advertiser_mirror_mismatch' && f.entityId === adv.id,
    );
    expect(finding).toBeDefined();
    expect(finding?.expected).toBe(100_000);
    expect(finding?.actual).toBe(999);
  });

  // Fix 7 (adversarial review): a campaign stuck pending_approval with
  // pendingReason 'agent_purchase' for a long time is a sign the owner never
  // saw (or acted on) the one-time approval notification — flag it so ops
  // can manually nudge them. This check never mutates the campaign.
  it('flags a campaign pending agent-purchase approval for more than 7 days', async () => {
    const adv = await seedAdvertiser(100_000);
    const campaignId = 'cmp_stale_agent_pending';
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await writeCampaign(campaignId, adv.id, 50_000, 50_000, 'pending_approval', {
      pendingReason: 'agent_purchase',
      createdAt: tenDaysAgo,
    });

    const report = await runReconciliation();

    const finding = report.findings.find(
      (f) => f.kind === 'stale_agent_pending_campaign' && f.entityId === campaignId,
    );
    expect(finding).toBeDefined();
    expect(finding?.expected).toBe(7);
    expect(finding?.actual).toBeGreaterThanOrEqual(10);
  });

  // Fix 1d (pendingReason lifecycle): the tag alone isn't sufficient — once a
  // campaign has left pending_approval (completed via creative-rejection or
  // the expiry sweep) it must stop generating this alert even if a
  // pendingReason tag somehow survived on it, or ops would get a daily nudge
  // to "approve/reject" a campaign that's already resolved.
  it('does not flag an old agent-purchase-tagged campaign whose status already left pending_approval', async () => {
    const adv = await seedAdvertiser(100_000);
    const campaignId = 'cmp_resolved_agent_pending';
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await writeCampaign(campaignId, adv.id, 0, 0, 'completed', {
      pendingReason: 'agent_purchase',
      createdAt: tenDaysAgo,
    });

    const report = await runReconciliation();

    expect(
      report.findings.some(
        (f) => f.kind === 'stale_agent_pending_campaign' && f.entityId === campaignId,
      ),
    ).toBe(false);
  });

  it('does not flag a fresh agent-purchase pending campaign (under 7 days old)', async () => {
    const adv = await seedAdvertiser(100_000);
    const campaignId = 'cmp_fresh_agent_pending';

    await writeCampaign(campaignId, adv.id, 50_000, 50_000, 'pending_approval', {
      pendingReason: 'agent_purchase',
      createdAt: new Date(),
    });

    const report = await runReconciliation();

    expect(
      report.findings.some(
        (f) => f.kind === 'stale_agent_pending_campaign' && f.entityId === campaignId,
      ),
    ).toBe(false);
  });

  it('skips the Redis budget-counter check gracefully when Redis is unconfigured', async () => {
    // The suite-level beforeEach already clears the Redis env vars.
    expect(isRedisConfigured()).toBe(false);

    const adv = await seedAdvertiser(100_000);
    const campaignId = 'cmp_redis_skip';
    const charged = 10_000;
    await chargeCampaign(adv.id, campaignId, charged);
    await writeCampaign(campaignId, adv.id, 30_000, 30_000 - charged);
    await creditPublisher('pub_redis_skip', campaignId, charged);

    const report = await runReconciliation();

    expect(report.counts.redisBudgetsChecked).toBe(0);
    expect(report.findings.some((f) => f.kind === 'redis_budget_overseeded')).toBe(false);
    // The event-pipeline check (check 6) shares the same isRedisConfigured() gate.
    expect(report.counts.eventPipelineHoursChecked).toBe(0);
    expect(report.findings.some((f) => f.kind === 'event_pipeline_loss')).toBe(false);
    // Checks 1-3 still ran and found nothing wrong with this consistent campaign.
    expect(report.findings.some((f) => f.entityId === campaignId || f.entityId === adv.id)).toBe(
      false,
    );
  });

  // Check 6: emitted-vs-recorded event pipeline. Serving increments
  // `emitted:{hour}` for every event it queues; the aggregator increments
  // `recorded:{hour}` for every event it writes. A materially lower recorded
  // count for an hour that's had time to settle means events are getting
  // lost between the two — this is the independent second count whose
  // absence let a measurement bug live undetected for months.
  describe('event pipeline (emitted vs recorded)', () => {
    // Fixed "now" two hours after the seeded hour bucket, well clear of the
    // in-flight settle window, so the checked bucket always falls inside the
    // 24-hour lookback and outside the 2-hour settle window.
    const seededHour = '2026080910';
    const now = new Date(Date.UTC(2026, 7, 9, 15)); // 2026-08-09T15:00:00Z

    it('flags an hour where materially fewer events were recorded than emitted', async () => {
      await withRedisConfigured(async () => {
        await seedCounters(seededHour, { emitted: 1000, recorded: 800 });
        const report = await runReconciliation(now);
        const finding = report.findings.find(
          (f) => f.kind === 'event_pipeline_loss' && f.entityId === seededHour,
        );
        expect(finding).toBeDefined();
        expect(finding?.expected).toBe(1000);
        expect(finding?.actual).toBe(800);
      });
    });

    it('tolerates a small gap', async () => {
      await withRedisConfigured(async () => {
        // tolerance = max(50, 1000 * 0.01) = 50; 995 >= 1000 - 50, so no finding.
        await seedCounters(seededHour, { emitted: 1000, recorded: 995 });
        const report = await runReconciliation(now);
        expect(report.findings.some((f) => f.kind === 'event_pipeline_loss')).toBe(false);
      });
    });

    it('ignores hours younger than two hours (events still in flight)', async () => {
      await withRedisConfigured(async () => {
        // Seed the counter for `now`'s own hour bucket — inside the 2-hour
        // settle window, so the lookback walk never even examines it.
        const inFlightHour = hourKeyFor(now);
        await seedCounters(inFlightHour, { emitted: 1000, recorded: 0 });
        const report = await runReconciliation(now);
        expect(report.findings.some((f) => f.kind === 'event_pipeline_loss')).toBe(false);
      });
    });

    it('ignores an hour with no emitted counter (evicted/expired)', async () => {
      await withRedisConfigured(async () => {
        // No emitted:{hour} at all (TTL expired or nothing ever emitted);
        // recorded present at 0 would otherwise look like total loss.
        await seedCounters(seededHour, { recorded: 0 });
        const report = await runReconciliation(now);
        expect(report.findings.some((f) => f.kind === 'event_pipeline_loss')).toBe(false);
        // Absence must not even count toward "hours checked".
        expect(report.counts.eventPipelineHoursChecked).toBe(0);
      });
    });

    it('checks the hour exactly at the two-hour settle boundary (not skipped by an off-by-one)', async () => {
      await withRedisConfigured(async () => {
        const boundaryHour = hourKeyFor(new Date(now.getTime() - 2 * 60 * 60 * 1000));
        await seedCounters(boundaryHour, { emitted: 1000, recorded: 800 });
        const report = await runReconciliation(now);
        expect(
          report.findings.some(
            (f) => f.kind === 'event_pipeline_loss' && f.entityId === boundaryHour,
          ),
        ).toBe(true);
      });
    });

    it('treats a missing recorded counter as zero when emitted is present', async () => {
      await withRedisConfigured(async () => {
        // The aggregator ran for the neighbouring hours but produced nothing
        // at all for this one — a real signal, unlike a missing emitted key.
        await seedCounters(seededHour, { emitted: 500 });
        const report = await runReconciliation(now);
        const finding = report.findings.find(
          (f) => f.kind === 'event_pipeline_loss' && f.entityId === seededHour,
        );
        expect(finding).toBeDefined();
        expect(finding?.actual).toBe(0);
      });
    });
  });

  // Task 3: checkPublisherBalances — independent publisher-side checks.
  it('flags a publisher whose ledger balance is negative (credits < completed payouts)', async () => {
    const publisherId = 'pub_negative_balance';
    await creditPublisherLedger(publisherId, 5_000, new Date(Date.UTC(2026, 5, 1)));
    const payoutId = 'pay_pub_negative_balance_202606';
    await writePayoutDoc(payoutId, publisherId, 10_000, 'completed');
    await payoutLedgerEntry(publisherId, -10_000, payoutId, new Date(Date.UTC(2026, 6, 1)));

    const report = await runReconciliation();

    const finding = report.findings.find(
      (f) => f.kind === 'publisher_negative_balance' && f.entityId === publisherId,
    );
    expect(finding).toBeDefined();
    expect(finding?.actual).toBe(-5_000);
  });

  it('flags a publisher stuck above the minimum across a payout run', async () => {
    const publisherId = 'pub_stuck_payable';
    // Safe on every day of every month: a calendar month is at most 31 days,
    // so `now` is at most 30 days after this month's start, which means "45
    // days ago" is always at least 15 days before this month's start —
    // never inside the current month, regardless of what day this runs on.
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await creditPublisherLedger(publisherId, 15_000, fortyFiveDaysAgo);

    const report = await runReconciliation();

    const finding = report.findings.find(
      (f) => f.kind === 'publisher_stuck_payable' && f.entityId === publisherId,
    );
    expect(finding).toBeDefined();
    expect(finding?.expected).toBe(MIN_PAYOUT_ISK);
    expect(finding?.actual).toBe(15_000);
  });

  it('is quiet for a healthy publisher (below minimum, recent, no payouts)', async () => {
    const publisherId = 'pub_healthy';
    await creditPublisherLedger(publisherId, 3_000, new Date());

    const report = await runReconciliation();

    expect(report.findings.filter((f) => f.kind.startsWith('publisher_'))).toHaveLength(0);
  });

  // Regression (false-alert fix): a publisher whose basis before this month
  // was BELOW the minimum, and only crosses it once this month's new
  // credits are added, is not stuck — the payout cron behaved correctly
  // every time it ran (nothing to pay before this month; next month's run
  // will pay them). An earlier version of check 7 compared the oldest
  // credit's date against "now" instead of comparing the pre-this-month
  // basis against the minimum, so it flagged every never-yet-paid publisher
  // with any old credit in their history — exactly this long-tail
  // carry-forward case, which is the platform's target market.
  it("does not flag a publisher whose basis only crosses the minimum via this month's new credits", async () => {
    const publisherId = 'pub_carry_forward_not_stuck';
    // Anchored to the month boundary itself, not day-offsets from "now": a
    // fixed offset like "3 days ago" lands in the PREVIOUS month whenever
    // this suite runs on the 1st-3rd of a month, which would silently move
    // all three credits before currentMonthStart and make the test assert
    // the opposite of what the (correctly firing) code would do.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const DAY = 24 * 60 * 60 * 1000;
    const beforeMonthA = new Date(monthStart.getTime() - 40 * DAY); // firmly in a prior month
    const beforeMonthB = new Date(monthStart.getTime() - 5 * DAY); // firmly in the prior month
    const inThisMonth = now; // by definition >= monthStart
    // Before this month: 4.000 + 4.000 = 8.000, below MIN_PAYOUT_ISK.
    await creditPublisherLedger(publisherId, 4_000, beforeMonthA);
    await creditPublisherLedger(publisherId, 4_000, beforeMonthB);
    // This month: +5.000 = 13.000 total, which crosses the minimum — but
    // only because of a credit dated this month, so nothing is stuck.
    await creditPublisherLedger(publisherId, 5_000, inThisMonth);

    const report = await runReconciliation();

    expect(
      report.findings.some(
        (f) => f.kind === 'publisher_stuck_payable' && f.entityId === publisherId,
      ),
    ).toBe(false);
  });

  // Self-review case: a payout doc already exists for this publisher's
  // unpaid basis but hasn't been disbursed yet (still 'pending', awaiting
  // bank transfer) — generateMonthlyPayouts already accounted for it (ALL
  // payout docs count, any status), so this must NOT be reported as stuck,
  // and since markPayoutCompleted hasn't run there's no ledger 'payout'
  // entry yet either, so it must not be reported as negative-balance.
  it('does not flag a publisher whose unpaid basis is already covered by a pending payout doc', async () => {
    const publisherId = 'pub_pending_covered';
    // Month-boundary-safe by construction, unlike the regression test below:
    // the 15.000 credit is fully offset by the 15.000 pending payout doc no
    // matter which side of the month boundary it falls on (basisAsOfLastRun
    // is <= 0 either way), so this fixture needs no anchoring.
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await creditPublisherLedger(publisherId, 15_000, fortyFiveDaysAgo);
    await writePayoutDoc('pay_pub_pending_covered_202607', publisherId, 15_000, 'pending');

    const report = await runReconciliation();

    expect(report.findings.filter((f) => f.kind.startsWith('publisher_'))).toHaveLength(0);
  });

  // IMPORTANT-1 (adversarial review): cron-reconcile runs "0 5 * * *" and
  // cron-payouts runs "0 6 1 * *" (apps/api/vercel.json) — on the 1st,
  // between 05:00 and 06:00 UTC, last month's credits are already past
  // currentMonthStart but this month's payout run hasn't executed yet, so
  // check 7 would false-alert on every publisher about to be paid correctly
  // an hour later. `now` is injected (not global-time-mocked) to make the
  // pre/post-cutoff behavior deterministic.
  it('suppresses the stuck-payable check inside the pre-payout-run window on the 1st', async () => {
    const publisherId = 'pub_prerun_window';
    const lastMonth = new Date(Date.UTC(2026, 6, 15)); // firmly in July
    await creditPublisherLedger(publisherId, 15_000, lastMonth);

    // 05:00 UTC on Aug 1 — cron-reconcile's own scheduled time, one hour
    // before cron-payouts (06:00 UTC) is due to run.
    const insidePreRunWindow = new Date(Date.UTC(2026, 7, 1, 5, 0, 0));
    const report = await runReconciliation(insidePreRunWindow);

    expect(
      report.findings.some(
        (f) => f.kind === 'publisher_stuck_payable' && f.entityId === publisherId,
      ),
    ).toBe(false);
  });

  it('flags the same genuinely stuck publisher once the pre-payout-run window has passed', async () => {
    const publisherId = 'pub_postrun_window';
    const lastMonth = new Date(Date.UTC(2026, 6, 15)); // firmly in July
    await creditPublisherLedger(publisherId, 15_000, lastMonth);

    // 06:00:01 UTC on Aug 1 — just after cron-payouts' scheduled run should
    // have generated a payout doc; since none exists, this publisher really
    // is stuck.
    const justAfterCutoff = new Date(Date.UTC(2026, 7, 1, 6, 0, 1));
    const report = await runReconciliation(justAfterCutoff);

    const finding = report.findings.find(
      (f) => f.kind === 'publisher_stuck_payable' && f.entityId === publisherId,
    );
    expect(finding).toBeDefined();
    expect(finding?.actual).toBe(15_000);
  });

  // IMPORTANT-2 (adversarial review): a payout doc stuck 'pending'/
  // 'processing' is subtracted from the basis forever, and neither check 6
  // (no ledger 'payout' entry yet, so balance looks fine) nor check 7
  // (paidNet already counts this doc's netIsk, so the basis looks covered)
  // ever notices — money is frozen silently. Check 8 flags it directly.
  it('flags a payout doc stuck pending/processing more than 35 days past its periodEnd', async () => {
    const publisherId = 'pub_stale_payout';
    const oldPeriodEnd = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await writePayoutDoc('pay_stale_pending', publisherId, 12_000, 'pending', oldPeriodEnd);

    const report = await runReconciliation();

    const finding = report.findings.find(
      (f) => f.kind === 'publisher_stale_payout_doc' && f.entityId === 'pay_stale_pending',
    );
    expect(finding).toBeDefined();
    expect(finding?.expected).toBe(35);
    expect(finding?.actual).toBeGreaterThanOrEqual(40);
  });

  it('does not flag a fresh pending payout doc (well within 35 days of its periodEnd)', async () => {
    const publisherId = 'pub_fresh_payout';
    const recentPeriodEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await writePayoutDoc('pay_fresh_pending', publisherId, 12_000, 'pending', recentPeriodEnd);

    const report = await runReconciliation();

    expect(report.findings.some((f) => f.kind === 'publisher_stale_payout_doc')).toBe(false);
  });

  it('does not flag an old COMPLETED payout doc — only pending/processing count as stuck', async () => {
    const publisherId = 'pub_old_completed';
    const oldPeriodEnd = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await writePayoutDoc('pay_old_completed', publisherId, 12_000, 'completed', oldPeriodEnd);

    const report = await runReconciliation();

    expect(report.findings.some((f) => f.kind === 'publisher_stale_payout_doc')).toBe(false);
  });

  /**
   * Check 9: implausible click-through rate.
   *
   * Every surface that displays CTR caps it at 100% (16 of them as of
   * 2026-08-14), which is right — clicks are not viewability-gated and
   * impressions are, so a small sample can legitimately show more clicks than
   * impressions and 140% on a dashboard reads as a broken product.
   *
   * The cost of that cap is that a genuine click-inflation bug now looks
   * identical to a normal day on every screen in the system: the number simply
   * sits at 100%. This check is the counterweight. It reads the raw, uncapped
   * ratio out of yesterday's settled publisher-day stats and alerts ops, so the
   * displayed figure can stay sensible without the underlying one going
   * unwatched.
   *
   * It is deliberately not a fraud detector. The threshold is set where no
   * honest explanation survives, not where behaviour merely looks odd.
   */
  const RECONCILE_AT = new Date(Date.UTC(2026, 7, 14, 5, 0, 0)); // 05:00 UTC, the cron's hour
  const YESTERDAY_KEY = '20260813';

  async function writePublisherDayStats(
    publisherId: string,
    dayKey: string,
    stats: { impressions: number; clicks: number },
  ): Promise<void> {
    await db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dayKey}`).set(stats);
  }

  it('flags a publisher day whose clicks are impossible against its impressions', async () => {
    // 900 clicks on 400 impressions is a raw CTR of 225%. Display CTR runs near
    // 0.1%, so this is not an unusually good day — it is three orders of
    // magnitude away from anything the funnel can produce.
    await writePublisherDayStats('pub_inflated', YESTERDAY_KEY, {
      impressions: 400,
      clicks: 900,
    });

    const report = await runReconciliation(RECONCILE_AT);

    const finding = report.findings.find((f) => f.kind === 'implausible_click_rate');
    expect(finding).toBeDefined();
    expect(finding?.entityId).toBe(`pub_inflated/${YESTERDAY_KEY}`);
    expect(finding?.expected).toBe(400);
    expect(finding?.actual).toBe(900);
    expect(report.counts.publisherStatDaysChecked).toBe(1);
  });

  it('flags a day with clicks but no recorded impressions at all', async () => {
    // Not a counting bug but worth the same alert: a slot that never reaches
    // the viewability threshold records no impressions while still being
    // clickable, which means the publisher is earning nothing for traffic that
    // is demonstrably engaging. Zero impressions must not divide-by-zero into
    // silence.
    await writePublisherDayStats('pub_no_impressions', YESTERDAY_KEY, {
      impressions: 0,
      clicks: 60,
    });

    const report = await runReconciliation(RECONCILE_AT);

    const finding = report.findings.find((f) => f.kind === 'implausible_click_rate');
    expect(finding).toBeDefined();
    expect(finding?.actual).toBe(60);
    expect(finding?.detail).not.toContain('NaN');
    expect(finding?.detail).not.toContain('Infinity');
  });

  it('is quiet for an ordinary day, however good the campaign was', async () => {
    // 2% CTR would be an exceptional display result and must not alert. The
    // threshold exists to catch broken arithmetic, not success.
    await writePublisherDayStats('pub_healthy', YESTERDAY_KEY, {
      impressions: 50_000,
      clicks: 1_000,
    });

    const report = await runReconciliation(RECONCILE_AT);

    expect(report.findings.some((f) => f.kind === 'implausible_click_rate')).toBe(false);
    expect(report.counts.publisherStatDaysChecked).toBe(1);
  });

  it('ignores a tiny sample, where a couple of uncounted impressions decide the ratio', async () => {
    // 7 clicks on 5 impressions is 140% — exactly the case the display cap was
    // added for. One visitor clicking an ad that never cleared the viewability
    // threshold produces this, and alerting ops on it would train them to
    // ignore the alert.
    await writePublisherDayStats('pub_tiny', YESTERDAY_KEY, { impressions: 5, clicks: 7 });

    const report = await runReconciliation(RECONCILE_AT);

    expect(report.findings.some((f) => f.kind === 'implausible_click_rate')).toBe(false);
    expect(report.counts.publisherStatDaysChecked).toBe(1);
  });

  it('reads yesterday, not today — today is still being aggregated', async () => {
    // The hourly aggregator has not finished today, so today's doc is a partial
    // count by definition and its ratio means nothing yet.
    await writePublisherDayStats('pub_today', '20260814', { impressions: 1, clicks: 500 });

    const report = await runReconciliation(RECONCILE_AT);

    expect(report.findings.some((f) => f.kind === 'implausible_click_rate')).toBe(false);
    expect(report.counts.publisherStatDaysChecked).toBe(0);
  });

  // The two thresholds are the whole check. Without a case sitting on each
  // edge, both could be moved to values that make the check useless — 50
  // clicks and 100% CTR, say, which is exactly the ratio the display cap hides
  // — and every test above still passes. These four pin them.
  it('does not fire one click below the minimum sample', async () => {
    await writePublisherDayStats('pub_19', YESTERDAY_KEY, { impressions: 0, clicks: 19 });
    const report = await runReconciliation(RECONCILE_AT);
    expect(report.findings.some((f) => f.kind === 'implausible_click_rate')).toBe(false);
  });

  it('fires exactly at the minimum sample', async () => {
    await writePublisherDayStats('pub_20', YESTERDAY_KEY, { impressions: 0, clicks: 20 });
    const report = await runReconciliation(RECONCILE_AT);
    expect(report.findings.some((f) => f.kind === 'implausible_click_rate')).toBe(true);
  });

  it('does not fire at exactly the plausible-rate ceiling', async () => {
    // 40 clicks on 200 impressions is 20.0% — the boundary itself is allowed,
    // only a rate strictly above it is a finding.
    await writePublisherDayStats('pub_at_ceiling', YESTERDAY_KEY, {
      impressions: 200,
      clicks: 40,
    });
    const report = await runReconciliation(RECONCILE_AT);
    expect(report.findings.some((f) => f.kind === 'implausible_click_rate')).toBe(false);
  });

  it('fires one click above the plausible-rate ceiling', async () => {
    await writePublisherDayStats('pub_over_ceiling', YESTERDAY_KEY, {
      impressions: 200,
      clicks: 41,
    });
    const report = await runReconciliation(RECONCILE_AT);
    expect(report.findings.some((f) => f.kind === 'implausible_click_rate')).toBe(true);
  });

  it('reports the finding in clicks and impressions, not in krónur', async () => {
    // buildAlertMessage renders every finding as "vænt N kr., raun M kr." unless
    // its kind is handled explicitly. This finding's numbers are event counts,
    // so the default branch would tell ops that 400 kr. was expected and 900 kr.
    // arrived — a money alert, about no money at all, for a check whose whole
    // purpose is to be believed when it fires.
    const savedAdminEmails = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'ops@reconcile.test.is';
    try {
      await writePublisherDayStats('pub_units', YESTERDAY_KEY, { impressions: 400, clicks: 900 });

      await runReconciliation(RECONCILE_AT);

      // alertOps writes an admin notification per recipient; that document is
      // the message ops actually receives.
      const notes = await db.collection(COLLECTIONS.notifications).get();
      const message = notes.docs.map((d) => String(d.data().message ?? '')).join('\n');
      expect(message).toContain('implausible_click_rate');
      expect(message).toContain('900 smellir');
      expect(message).toContain('400 birtingum');
      expect(message).not.toContain('900 kr.');
      expect(message).not.toContain('400 kr.');
    } finally {
      if (savedAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = savedAdminEmails;
    }
  });

  it('checks every publisher that has stats, not just the first', async () => {
    await writePublisherDayStats('pub_a_ok', YESTERDAY_KEY, { impressions: 10_000, clicks: 12 });
    await writePublisherDayStats('pub_b_bad', YESTERDAY_KEY, { impressions: 100, clicks: 400 });
    await writePublisherDayStats('pub_c_bad', YESTERDAY_KEY, { impressions: 50, clicks: 300 });

    const report = await runReconciliation(RECONCILE_AT);

    const flagged = report.findings
      .filter((f) => f.kind === 'implausible_click_rate')
      .map((f) => f.entityId)
      .sort();
    expect(flagged).toEqual([`pub_b_bad/${YESTERDAY_KEY}`, `pub_c_bad/${YESTERDAY_KEY}`]);
    expect(report.counts.publisherStatDaysChecked).toBe(3);
  });

  /**
   * Check 10: a platform-wide jump in click rate against its own recent past.
   *
   * Check 9 above only catches the extreme — 20% CTR is two hundred times the
   * norm, so a bug that merely triples every click sails past it, and on a
   * long-tail blog with five clicks a day it never even reaches the minimum
   * sample. That is the failure this whole feature was asked for: something
   * starts double- or triple-counting clicks and every dashboard keeps showing
   * a tidy number.
   *
   * A counting bug is systemic, so the platform total is where it shows up, and
   * pooling every publisher is also what makes the comparison statistically
   * meaningful — one small blog's daily CTR swings by multiples on its own and
   * would alert constantly.
   */
  const PRIOR_DAY_KEYS = [
    '20260812',
    '20260811',
    '20260810',
    '20260809',
    '20260808',
    '20260807',
    '20260806',
  ];

  /** Seven quiet baseline days for one publisher, at a normal ~0.1% CTR. */
  async function seedBaselineWeek(
    publisherId: string,
    perDay: { impressions: number; clicks: number },
  ): Promise<void> {
    for (const dk of PRIOR_DAY_KEYS) {
      await writePublisherDayStats(publisherId, dk, perDay);
    }
  }

  it('flags a platform-wide click rate that tripled overnight', async () => {
    // Baseline: 0.1% CTR, the display norm. Yesterday: the same traffic with
    // three times the clicks. Check 9 sees 0.3% and says nothing, correctly —
    // this is the check that has to catch it.
    await seedBaselineWeek('pub_steady', { impressions: 100_000, clicks: 100 });
    await writePublisherDayStats('pub_steady', YESTERDAY_KEY, {
      impressions: 100_000,
      clicks: 300,
    });

    const report = await runReconciliation(RECONCILE_AT);

    expect(report.findings.some((f) => f.kind === 'implausible_click_rate')).toBe(false);
    const spike = report.findings.find((f) => f.kind === 'platform_click_rate_spike');
    expect(spike).toBeDefined();
    expect(spike?.actual).toBe(300);
    expect(spike?.expected).toBe(100); // baseline rate applied to yesterday's traffic
  });

  it('does not fire just below the spike factor', async () => {
    // 299 clicks where 100 were expected is 2.99x. The factor is the whole
    // check; without a case sitting under it, it could be raised to 10 and
    // every other test here would still pass.
    await seedBaselineWeek('pub_just_under', { impressions: 100_000, clicks: 100 });
    await writePublisherDayStats('pub_just_under', YESTERDAY_KEY, {
      impressions: 100_000,
      clicks: 299,
    });

    const report = await runReconciliation(RECONCILE_AT);

    expect(report.findings.some((f) => f.kind === 'platform_click_rate_spike')).toBe(false);
  });

  it('reports the spike in clicks, not in krónur', async () => {
    // Same trap as check 9: buildAlertMessage renders any unhandled kind as
    // "vænt N kr., raun M kr.", which would turn a click-counting alert into a
    // money alert about no money.
    const savedAdminEmails = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'ops@reconcile.test.is';
    try {
      await seedBaselineWeek('pub_spike_units', { impressions: 100_000, clicks: 100 });
      await writePublisherDayStats('pub_spike_units', YESTERDAY_KEY, {
        impressions: 100_000,
        clicks: 300,
      });

      await runReconciliation(RECONCILE_AT);

      const notes = await db.collection(COLLECTIONS.notifications).get();
      const message = notes.docs.map((d) => String(d.data().message ?? '')).join('\n');
      expect(message).toContain('platform_click_rate_spike');
      expect(message).toContain('300 smellir');
      expect(message).toContain('100 væntanlegir');
      expect(message).not.toContain('300 kr.');
      expect(message).not.toContain('100 kr.');
    } finally {
      if (savedAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = savedAdminEmails;
    }
  });

  it('is quiet when the rate holds steady, even as traffic grows', async () => {
    // Expectation is a RATE applied to yesterday's impressions, not last week's
    // click count — a publisher who doubles their traffic must not alert.
    await seedBaselineWeek('pub_growing', { impressions: 100_000, clicks: 100 });
    await writePublisherDayStats('pub_growing', YESTERDAY_KEY, {
      impressions: 200_000,
      clicks: 205,
    });

    const report = await runReconciliation(RECONCILE_AT);

    expect(report.findings.some((f) => f.kind === 'platform_click_rate_spike')).toBe(false);
  });

  it('stays quiet on a platform too small for the comparison to mean anything', async () => {
    // Four clicks a week against three yesterday is a tripling in ratio and
    // pure noise in fact. Alerting here would train ops to ignore the alert.
    await seedBaselineWeek('pub_quiet', { impressions: 500, clicks: 0 });
    await writePublisherDayStats('pub_quiet', YESTERDAY_KEY, { impressions: 500, clicks: 3 });

    const report = await runReconciliation(RECONCILE_AT);

    expect(report.findings.some((f) => f.kind === 'platform_click_rate_spike')).toBe(false);
  });

  it('pools every publisher rather than comparing them one by one', async () => {
    // Two publishers, each individually below the volume the check needs, are
    // together well above it — and together they show the tripling. A per
    // -publisher version of this check would miss exactly this.
    await seedBaselineWeek('pub_half_a', { impressions: 50_000, clicks: 50 });
    await seedBaselineWeek('pub_half_b', { impressions: 50_000, clicks: 50 });
    await writePublisherDayStats('pub_half_a', YESTERDAY_KEY, {
      impressions: 50_000,
      clicks: 150,
    });
    await writePublisherDayStats('pub_half_b', YESTERDAY_KEY, {
      impressions: 50_000,
      clicks: 150,
    });

    const report = await runReconciliation(RECONCILE_AT);

    const spike = report.findings.find((f) => f.kind === 'platform_click_rate_spike');
    expect(spike).toBeDefined();
    expect(spike?.actual).toBe(300);
  });

  it('says nothing at all on a platform with no history yet', async () => {
    // A fresh deploy has no baseline. Absent history must read as "cannot
    // compare", never as a baseline of zero, which would make every first day
    // an infinite spike.
    await writePublisherDayStats('pub_brand_new', YESTERDAY_KEY, {
      impressions: 100_000,
      clicks: 300,
    });

    const report = await runReconciliation(RECONCILE_AT);

    expect(report.findings.some((f) => f.kind === 'platform_click_rate_spike')).toBe(false);
  });
});
