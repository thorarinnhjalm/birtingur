import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { COLLECTIONS, campaignConverter } from '@ada/shared/firestore';
import { DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';
import type { Campaign } from '@ada/shared';
import { db } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { topUp, chargeCampaign, creditPublisher } from '../src/services/wallet';
import { appendLedger } from '../src/services/ledger';
import { isRedisConfigured } from '../src/lib/redis';
import { runReconciliation } from '../src/services/reconciliation';

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
    };
    await db
      .collection(COLLECTIONS.campaigns)
      .doc(id)
      .withConverter(campaignConverter)
      .set(campaign);
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
});
