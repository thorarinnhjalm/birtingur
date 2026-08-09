import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { runReconciliation } from '../src/services/reconciliation';
import { generateId } from '../src/lib/id';

// These tests run against the real Firestore emulator (not a mocked db), like
// tests/wallet-reservation.test.ts — reconciliation.ts issues genuine
// `where('relatedId', ...)` / `where('party.type', ...)` queries that a hand
// -rolled mock would have to reimplement anyway.
//
// Redis is deliberately kept unconfigured for the whole file: a developer's
// local .env.local may carry real Upstash credentials, and these tests must
// never depend on (or reach out to) a real Redis instance. Every test but the
// last one is exercising checks 1-3, which don't touch Redis at all; the last
// test asserts the check-4 skip path explicitly.
const REDIS_ENV_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
] as const;
let savedRedisEnv: Record<string, string | undefined> = {};

describe('runReconciliation', () => {
  beforeEach(async () => {
    savedRedisEnv = {};
    for (const key of REDIS_ENV_KEYS) {
      savedRedisEnv[key] = process.env[key];
      delete process.env[key];
    }
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
    // Checks 1-3 still ran and found nothing wrong with this consistent campaign.
    expect(report.findings.some((f) => f.entityId === campaignId || f.entityId === adv.id)).toBe(
      false,
    );
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
});
