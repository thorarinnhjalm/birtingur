import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS, ledgerEntryConverter, campaignConverter } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import {
  createCampaign,
  approveAgentPurchaseCampaign,
  rejectAgentPurchaseCampaign,
  listCampaignsForAdvertiser,
  getCampaign,
  type CreateCampaignInput,
} from '../src/services/campaigns';
import { topUp, getAvailableBalance } from '../src/services/wallet';
import { issueApiKey, updateApiKeyPurchase, getApiKeyRecord } from '../src/services/api-keys';
import { listNotifications } from '../src/services/notifications';
import { adminReview } from '../src/services/approvals';
import { runReconciliation } from '../src/services/reconciliation';
import { app } from '../src/index';
import type { Advertiser, Creative, Campaign } from '@ada/shared';

// Agentic-buying guardrails (docs/superpowers/plans/2026-07-27-advertiser-mcp-agentic-buying.md):
// purchase gate, monthly cap, auto-approve threshold, idempotency, owner
// approve/reject, and scope enforcement. Runs against the real Firestore
// emulator (not a mocked db) — the concurrency tests in particular depend on
// genuine transaction retry-on-conflict semantics, same as
// tests/wallet-reservation.test.ts.

describe('Agent purchase (advertiser-MCP agentic buying)', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  async function seedAgentSetup(opts: {
    ownerEmail: string;
    balanceIsk: number;
    monthlyCapIsk: number;
    autoApproveLimitIsk: number;
    scope?: 'advertiser' | 'publisher' | 'both';
    enable?: boolean;
  }): Promise<{ adv: Advertiser; creative: Creative; apiKeyId: string; apiKey: string }> {
    const adv = await createAdvertiser({
      ownerEmail: opts.ownerEmail,
      companyName: 'Agent Purchase Test ehf.',
      kennitala: '1234567890',
      vatNumber: '1',
    });
    if (opts.balanceIsk > 0) {
      await topUp(adv.id, opts.balanceIsk, `topup_${adv.id}`);
    }
    const creative = await createCreative(
      adv.id,
      {
        imageUrl: 'https://example.com/agent.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is/agent', // clean URL -> auto_approved
      },
      new StubAutoScanner(),
    );
    const { id: apiKeyId, key: apiKey } = await issueApiKey(
      opts.ownerEmail,
      opts.scope ?? 'advertiser',
    );
    if (opts.enable !== false) {
      await updateApiKeyPurchase(apiKeyId, opts.ownerEmail, {
        enabled: true,
        monthlyCapIsk: opts.monthlyCapIsk,
        autoApproveLimitIsk: opts.autoApproveLimitIsk,
      });
    }
    return { adv, creative, apiKeyId, apiKey };
  }

  function campaignInput(
    creativeId: string,
    totalIsk: number,
    extra: Partial<CreateCampaignInput> = {},
  ): CreateCampaignInput {
    return {
      creativeIds: [creativeId],
      categories: ['matur'],
      schedule: {
        startsAt: new Date(Date.now() + 1000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
      budget: { mode: 'cpm_capped', totalIsk },
      ...extra,
    };
  }

  describe('purchase gate', () => {
    it('rejects an ak_ key with no purchase config at all', async () => {
      const adv = await createAdvertiser({
        ownerEmail: 'nopurchase@agent-purchase.test.is',
        companyName: 'No Purchase ehf.',
        kennitala: '1234567890',
        vatNumber: '1',
      });
      await topUp(adv.id, 200_000, `topup_${adv.id}`);
      const creative = await createCreative(
        adv.id,
        {
          imageUrl: 'https://example.com/a.png',
          width: 728,
          height: 90,
          clickUrl: 'https://blomabud.is/x',
        },
        new StubAutoScanner(),
      );
      const { id: apiKeyId } = await issueApiKey('nopurchase@agent-purchase.test.is', 'advertiser');

      await expect(
        createCampaign(adv.id, campaignInput(creative.id, 10_000), {
          channel: 'api',
          apiKeyId,
        }),
      ).rejects.toMatchObject({ code: 'PURCHASE_NOT_ENABLED' });
    });

    it('rejects an ak_ key with purchase explicitly disabled', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'disabled@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 50_000,
      });
      await updateApiKeyPurchase(apiKeyId, 'disabled@agent-purchase.test.is', {
        enabled: false,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 50_000,
      });

      await expect(
        createCampaign(adv.id, campaignInput(creative.id, 10_000), {
          channel: 'api',
          apiKeyId,
        }),
      ).rejects.toMatchObject({ code: 'PURCHASE_NOT_ENABLED' });
    });

    it('creates an active campaign, tagged with createdVia, when enabled and under both caps', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'active@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 50_000,
      });

      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 30_000), {
        channel: 'api',
        apiKeyId,
      });

      expect(cmp.status).toBe('active');
      // Fix 7c: a fresh (non-replayed) create omits `idempotent` entirely
      // rather than carrying `idempotent: false`, so the response shape a
      // normal create returns is unchanged from before agentic buying
      // existed.
      expect(cmp.idempotent).toBeUndefined();
      expect(cmp.createdVia).toMatchObject({ channel: 'api', apiKeyId });
      expect(cmp.pendingReason).toBeUndefined();
    });

    it('dashboard/non-key creates are tagged createdVia channel dashboard', async () => {
      const { adv, creative } = await seedAgentSetup({
        ownerEmail: 'dashboard@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 100_000,
      });
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 20_000));
      expect(cmp.createdVia).toMatchObject({ channel: 'dashboard' });
      expect(cmp.createdVia?.apiKeyId).toBeUndefined();
    });
  });

  describe('auto-approve threshold', () => {
    it('forces pending_approval + notifies the owner when the budget exceeds autoApproveLimitIsk', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'overlimit@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 50_000,
      });

      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 60_000), {
        channel: 'mcp',
        apiKeyId,
      });

      expect(cmp.status).toBe('pending_approval');
      expect(cmp.pendingReason).toBe('agent_purchase');

      const notifs = await listNotifications('overlimit@agent-purchase.test.is', 'advertiser');
      expect(notifs.some((n) => n.title === 'Agent óskar eftir herferð')).toBe(true);
    });

    it('keeps a pending agent-purchase campaign fund-holding (committed) until resolved', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'fundholding@agent-purchase.test.is',
        balanceIsk: 100_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 10_000,
      });

      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 80_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(cmp.status).toBe('pending_approval');

      const { committedIsk, availableIsk } = await getAvailableBalance(adv.id);
      expect(committedIsk).toBe(80_000);
      expect(availableIsk).toBe(20_000);
    });
  });

  describe('monthly cap', () => {
    it('rejects a create that would push month-to-date agent spend over the cap, allows exactly at cap', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'cap@agent-purchase.test.is',
        balanceIsk: 500_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 100_000,
      });

      await createCampaign(adv.id, campaignInput(creative.id, 60_000), {
        channel: 'api',
        apiKeyId,
      });

      await expect(
        createCampaign(adv.id, campaignInput(creative.id, 45_000), {
          channel: 'api',
          apiKeyId,
        }),
      ).rejects.toMatchObject({ code: 'MONTHLY_CAP_EXCEEDED' });

      const atCap = await createCampaign(adv.id, campaignInput(creative.id, 40_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(atCap.budget.totalIsk).toBe(40_000); // 60_000 + 40_000 = 100_000, exactly the cap
    });

    it('lets exactly one of two concurrent creates through when they would jointly bust the cap', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'caprace@agent-purchase.test.is',
        balanceIsk: 500_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 100_000,
      });

      const results = await Promise.allSettled([
        createCampaign(adv.id, campaignInput(creative.id, 60_000), {
          channel: 'api',
          apiKeyId,
        }),
        createCampaign(adv.id, campaignInput(creative.id, 60_000), {
          channel: 'api',
          apiKeyId,
        }),
      ]);

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createCampaign>>> =>
          r.status === 'fulfilled',
      );
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toMatchObject({ code: 'MONTHLY_CAP_EXCEEDED' });
    });
  });

  describe('idempotency', () => {
    it('a replayed create with the same idempotency key returns the same campaign, charged once', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'idem@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 100_000,
      });
      const ctx = { channel: 'api' as const, apiKeyId, idempotencyKey: 'idem-key-1' };

      const first = await createCampaign(adv.id, campaignInput(creative.id, 30_000), ctx);
      // Fix 7c: fresh create, no `idempotent` field at all.
      expect(first.idempotent).toBeUndefined();

      const second = await createCampaign(adv.id, campaignInput(creative.id, 30_000), ctx);
      expect(second.idempotent).toBe(true);
      expect(second.id).toBe(first.id);

      const all = await listCampaignsForAdvertiser(adv.id);
      expect(all).toHaveLength(1);

      const { availableIsk } = await getAvailableBalance(adv.id);
      expect(availableIsk).toBe(200_000 - 30_000); // funds committed once, not twice
    });
  });

  describe('owner approve/reject flow', () => {
    it('approve activates a campaign whose creatives are already approved, clearing pendingReason', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'approve@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 200_000,
        autoApproveLimitIsk: 10_000,
      });
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 50_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(cmp.status).toBe('pending_approval');
      expect(cmp.pendingReason).toBe('agent_purchase');

      const approved = await approveAgentPurchaseCampaign(cmp.id, adv.id);
      expect(approved.status).toBe('active');
      expect(approved.pendingReason).toBeUndefined();
    });

    it('reject releases the committed hold without a refund ledger entry', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'reject@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 200_000,
        autoApproveLimitIsk: 10_000,
      });
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 50_000), {
        channel: 'api',
        apiKeyId,
      });

      const before = await getAvailableBalance(adv.id);
      expect(before.availableIsk).toBe(150_000); // 200_000 - 50_000 committed

      const rejected = await rejectAgentPurchaseCampaign(cmp.id, adv.id);
      expect(rejected.status).toBe('completed');
      expect(rejected.budget.remainingIsk).toBe(0);

      const after = await getAvailableBalance(adv.id);
      expect(after.availableIsk).toBe(200_000); // hold released, full balance available again

      const ledgerSnap = await db
        .collection(COLLECTIONS.ledger)
        .where('party.type', '==', 'advertiser')
        .where('party.id', '==', adv.id)
        .withConverter(ledgerEntryConverter)
        .get();
      const refunds = ledgerSnap.docs.map((d) => d.data()).filter((e) => e.type === 'refund');
      expect(refunds).toHaveLength(0);
    });

    it('rejects approve/reject on a campaign not tagged agent_purchase', async () => {
      const { adv, creative } = await seedAgentSetup({
        ownerEmail: 'nottagged@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 200_000,
        autoApproveLimitIsk: 200_000,
      });
      // Dashboard-created (no ctx), never carries the agent tag.
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 20_000));
      expect(cmp.pendingReason).toBeUndefined();

      await expect(approveAgentPurchaseCampaign(cmp.id, adv.id)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(rejectAgentPurchaseCampaign(cmp.id, adv.id)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    // Fix 1a (pendingReason lifecycle, defense in depth): even in a
    // hypothetical inconsistent state where a pendingReason tag survives past
    // pending_approval (e.g. a pre-fix row, or a future writer that forgets
    // to clear it), approve/reject must not resurrect the campaign — both
    // require status === 'pending_approval' in addition to the tag.
    it('rejects approve/reject on a tagged campaign whose status already left pending_approval', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'staletag@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 200_000,
        autoApproveLimitIsk: 10_000,
      });
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 50_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(cmp.status).toBe('pending_approval');
      expect(cmp.pendingReason).toBe('agent_purchase');

      // Force an inconsistent state directly (bypassing every guarded
      // writer): a completed campaign that still carries the tag.
      await db
        .collection(COLLECTIONS.campaigns)
        .doc(cmp.id)
        .withConverter(campaignConverter)
        .set({ ...cmp, status: 'completed' });

      await expect(approveAgentPurchaseCampaign(cmp.id, adv.id)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(rejectAgentPurchaseCampaign(cmp.id, adv.id)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    // Fix 5 (adversarial review): a rejected purchase never served, so its
    // true spend is 0 — reject must zero budget.totalIsk too (not just
    // remainingIsk), or the campaign keeps occupying headroom under the
    // key's monthly cap forever despite never having spent a single ISK.
    it('reject zeroes budget.totalIsk too, freeing the monthly cap it never should have held', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'rejectcap@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 60_000,
        autoApproveLimitIsk: 10_000,
      });
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 60_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(cmp.status).toBe('pending_approval');

      // At cap: a second create of any size is rejected.
      await expect(
        createCampaign(adv.id, campaignInput(creative.id, 1), { channel: 'api', apiKeyId }),
      ).rejects.toMatchObject({ code: 'MONTHLY_CAP_EXCEEDED' });

      const rejected = await rejectAgentPurchaseCampaign(cmp.id, adv.id);
      expect(rejected.budget.totalIsk).toBe(0);
      expect(rejected.budget.remainingIsk).toBe(0);

      // Cap headroom is back to the full 60_000 — the rejected campaign no
      // longer counts (sumMonthToDateAgentSpend sums budget.totalIsk).
      const atCapAgain = await createCampaign(adv.id, campaignInput(creative.id, 60_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(atCapAgain.budget.totalIsk).toBe(60_000);
    });

    // Fix 6 (adversarial review): approve and reject must be transactional so
    // a race between them can never leave a campaign active with a zeroed
    // budget (or any other illegal mixed state) — exactly one of the two
    // concurrent calls may win, and the loser must see a clean 400.
    it('lets exactly one of a concurrent approve+reject through, never active-with-zero-budget', async () => {
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'race@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 200_000,
        autoApproveLimitIsk: 10_000,
      });
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 50_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(cmp.status).toBe('pending_approval');

      const results = await Promise.allSettled([
        approveAgentPurchaseCampaign(cmp.id, adv.id),
        rejectAgentPurchaseCampaign(cmp.id, adv.id),
      ]);

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<Campaign> => r.status === 'fulfilled',
      );
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toMatchObject({ code: 'BAD_REQUEST' });

      const finalStatus = fulfilled[0]!.value.status;
      const finalBudget = fulfilled[0]!.value.budget;
      // The two legal outcomes: approved-and-active with its full budget
      // intact, or rejected-and-completed with budget fully zeroed. Never a
      // mix (e.g. active with remainingIsk/totalIsk zeroed).
      if (finalStatus === 'active') {
        expect(finalBudget.totalIsk).toBe(50_000);
        expect(finalBudget.remainingIsk).toBe(50_000);
      } else {
        expect(finalStatus).toBe('completed');
        expect(finalBudget.totalIsk).toBe(0);
        expect(finalBudget.remainingIsk).toBe(0);
      }

      // The persisted Firestore state agrees with whichever one won.
      const persisted = await getCampaign(cmp.id);
      expect(persisted!.status).toBe(finalStatus);
      expect(persisted!.budget.totalIsk).toBe(finalBudget.totalIsk);
    });
  });

  describe('propagateCreativeChange must not activate an agent-purchase pending campaign (Fix 2)', () => {
    it('creative approval leaves an agent_purchase-pending campaign pending, with the reason intact, until owner approval', async () => {
      const adv = await createAdvertiser({
        ownerEmail: 'creativeapprove@agent-purchase.test.is',
        companyName: 'Creative Approve Test ehf.',
        kennitala: '1234567890',
        vatNumber: '1',
      });
      await topUp(adv.id, 200_000, `topup_${adv.id}`);
      // bit.ly clickUrl -> StubAutoScanner flags for manual review (pending),
      // not auto-approved — so the campaign create below is also pending on
      // ordinary creative review, layered with the agent-purchase reason.
      const creative = await createCreative(
        adv.id,
        {
          imageUrl: 'https://example.com/needs-review.png',
          width: 728,
          height: 90,
          clickUrl: 'https://bit.ly/needs-review',
        },
        new StubAutoScanner(),
      );
      const { id: apiKeyId } = await issueApiKey(
        'creativeapprove@agent-purchase.test.is',
        'advertiser',
      );
      await updateApiKeyPurchase(apiKeyId, 'creativeapprove@agent-purchase.test.is', {
        enabled: true,
        monthlyCapIsk: 200_000,
        autoApproveLimitIsk: 10_000,
      });

      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 50_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(cmp.status).toBe('pending_approval');
      expect(cmp.pendingReason).toBe('agent_purchase');

      // Admin approves the creative — WITHOUT this fix, propagateCreativeChange
      // would see cmp.status === 'pending_approval', find all creatives now
      // approved, and flip the campaign straight to 'active', letting the
      // agent effectively self-activate its own over-the-limit purchase via
      // creative re-scan. With the fix, it must stay put.
      await adminReview(creative.id, { action: 'approve', adminEmail: 'admin@birtingur.app' });

      const stillPending = await getCampaign(cmp.id);
      expect(stillPending!.status).toBe('pending_approval');
      expect(stillPending!.pendingReason).toBe('agent_purchase');

      // Only the owner's explicit approval activates it — and it re-checks
      // creative approval status on the way out, so nothing is lost.
      const approved = await approveAgentPurchaseCampaign(cmp.id, adv.id);
      expect(approved.status).toBe('active');
      expect(approved.pendingReason).toBeUndefined();
    });

    it('creative rejection still completes an agent_purchase campaign when it was the sole creative', async () => {
      const adv = await createAdvertiser({
        ownerEmail: 'creativereject@agent-purchase.test.is',
        companyName: 'Creative Reject Test ehf.',
        kennitala: '1234567890',
        vatNumber: '1',
      });
      await topUp(adv.id, 200_000, `topup_${adv.id}`);
      const creative = await createCreative(
        adv.id,
        {
          imageUrl: 'https://example.com/needs-review-2.png',
          width: 728,
          height: 90,
          clickUrl: 'https://bit.ly/needs-review-2',
        },
        new StubAutoScanner(),
      );
      const { id: apiKeyId } = await issueApiKey(
        'creativereject@agent-purchase.test.is',
        'advertiser',
      );
      await updateApiKeyPurchase(apiKeyId, 'creativereject@agent-purchase.test.is', {
        enabled: true,
        monthlyCapIsk: 200_000,
        autoApproveLimitIsk: 10_000,
      });

      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 50_000), {
        channel: 'api',
        apiKeyId,
      });
      expect(cmp.pendingReason).toBe('agent_purchase');

      // Rejecting the sole creative releases the fund hold regardless of the
      // agent-purchase tag — a dead creative kills the campaign either way.
      await adminReview(creative.id, {
        action: 'reject',
        adminEmail: 'admin@birtingur.app',
        reason: 'Test rejection',
      });

      const completed = await getCampaign(cmp.id);
      expect(completed!.status).toBe('completed');
      // Fix 1 (pendingReason lifecycle): the tag must not outlive
      // pending_approval — a lingering tag here would permanently stick this
      // completed campaign in the dashboard's PendingAgentCampaigns card and
      // trip the daily reconciliation "stale agent pending" alert forever.
      expect(completed!.pendingReason).toBeUndefined();

      const report = await runReconciliation();
      expect(report.findings.some((f) => f.entityId === cmp.id)).toBe(false);

      // Now-orphaned of its tag, the completed campaign is no longer a valid
      // target for owner approve/reject (both require pendingReason ===
      // 'agent_purchase' AND status === 'pending_approval').
      await expect(approveAgentPurchaseCampaign(cmp.id, adv.id)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(rejectAgentPurchaseCampaign(cmp.id, adv.id)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  describe('idempotency key scoping by API key (Fix 4)', () => {
    it('scopes a replay to the calling API key — a second key using the same idempotency key does not collide', async () => {
      const adv = await createAdvertiser({
        ownerEmail: 'idemscope@agent-purchase.test.is',
        companyName: 'Idem Scope Test ehf.',
        kennitala: '1234567890',
        vatNumber: '1',
      });
      await topUp(adv.id, 400_000, `topup_${adv.id}`);
      const creative = await createCreative(
        adv.id,
        {
          imageUrl: 'https://example.com/idemscope.png',
          width: 728,
          height: 90,
          clickUrl: 'https://blomabud.is/idemscope',
        },
        new StubAutoScanner(),
      );
      const { id: keyA } = await issueApiKey('idemscope@agent-purchase.test.is', 'advertiser');
      const { id: keyB } = await issueApiKey('idemscope@agent-purchase.test.is', 'advertiser');
      for (const id of [keyA, keyB]) {
        await updateApiKeyPurchase(id, 'idemscope@agent-purchase.test.is', {
          enabled: true,
          monthlyCapIsk: 300_000,
          autoApproveLimitIsk: 300_000,
        });
      }

      const sharedIdempotencyKey = 'same-literal-key-both-agents-happen-to-use';
      const first = await createCampaign(adv.id, campaignInput(creative.id, 30_000), {
        channel: 'api',
        apiKeyId: keyA,
        idempotencyKey: sharedIdempotencyKey,
      });
      const second = await createCampaign(adv.id, campaignInput(creative.id, 30_000), {
        channel: 'api',
        apiKeyId: keyB,
        idempotencyKey: sharedIdempotencyKey,
      });

      expect(first.idempotent).toBeUndefined();
      expect(second.idempotent).toBeUndefined();
      expect(second.id).not.toBe(first.id);

      const all = await listCampaignsForAdvertiser(adv.id);
      expect(all).toHaveLength(2); // both charged, neither shadowed the other
    });

    it('an explicit, reused idempotency key still collapses two different-content purchases (by design)', async () => {
      // This documents the OTHER half of Fix 4: an explicitly-supplied
      // idempotency_key always wins and dedupes on its literal value alone
      // (advertiser + apiKeyId scoped) — regardless of whether the request
      // body actually differs. That's correct: an explicit key is the
      // caller's deliberate signal "treat these as the same operation". The
      // guarantee that differing geo_regions (or name, etc.) produce
      // DIFFERENT auto-derived keys when the caller does NOT supply one
      // lives in apps/mcp/tests/create-campaign.test.ts
      // (deriveIdempotencyKey) — that's the one that actually protects an
      // agent that omits idempotency_key from accidentally collapsing two
      // real purchases.
      const { adv, creative, apiKeyId } = await seedAgentSetup({
        ownerEmail: 'geoidem@agent-purchase.test.is',
        balanceIsk: 400_000,
        monthlyCapIsk: 300_000,
        autoApproveLimitIsk: 300_000,
      });
      const ctx = { channel: 'api' as const, apiKeyId, idempotencyKey: 'geo-idem-key' };

      const first = await createCampaign(
        adv.id,
        campaignInput(creative.id, 20_000, { geoRegions: ['reykjavik'] }),
        ctx,
      );
      const second = await createCampaign(
        adv.id,
        campaignInput(creative.id, 20_000, { geoRegions: ['akureyri'] }),
        ctx,
      );

      expect(second.idempotent).toBe(true);
      expect(second.id).toBe(first.id);
    });
  });

  describe('API key purchase config validation (Task 1)', () => {
    it('a fresh key has no purchase config at all — fail-closed default', async () => {
      const { id } = await issueApiKey('rawkey@agent-purchase.test.is', 'advertiser');
      const record = await getApiKeyRecord(id);
      expect(record?.purchase).toBeUndefined();
    });

    it('rejects autoApproveLimitIsk greater than monthlyCapIsk', async () => {
      const { id } = await issueApiKey('badcfg@agent-purchase.test.is', 'advertiser');
      await expect(
        updateApiKeyPurchase(id, 'badcfg@agent-purchase.test.is', {
          enabled: true,
          monthlyCapIsk: 10_000,
          autoApproveLimitIsk: 20_000,
        }),
      ).rejects.toThrow();
    });

    it('rejects non-integer amounts', async () => {
      const { id } = await issueApiKey('badcfg2@agent-purchase.test.is', 'advertiser');
      await expect(
        updateApiKeyPurchase(id, 'badcfg2@agent-purchase.test.is', {
          enabled: true,
          monthlyCapIsk: 10_000.5,
          autoApproveLimitIsk: 5_000,
        }),
      ).rejects.toThrow();
    });

    it('rejects updates from a non-owner email', async () => {
      const { id } = await issueApiKey('owner@agent-purchase.test.is', 'advertiser');
      await expect(
        updateApiKeyPurchase(id, 'someone-else@agent-purchase.test.is', {
          enabled: true,
          monthlyCapIsk: 10_000,
          autoApproveLimitIsk: 5_000,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects enabling purchase on a publisher-scoped key', async () => {
      const { id } = await issueApiKey('pubonly@agent-purchase.test.is', 'publisher');
      await expect(
        updateApiKeyPurchase(id, 'pubonly@agent-purchase.test.is', {
          enabled: true,
          monthlyCapIsk: 10_000,
          autoApproveLimitIsk: 5_000,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('GET /v1/api-keys/me purchase reporting', () => {
    it('reports purchase config, month-to-date spend and remaining cap headroom', async () => {
      const { adv, creative, apiKeyId, apiKey } = await seedAgentSetup({
        ownerEmail: 'mereport@agent-purchase.test.is',
        balanceIsk: 200_000,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 100_000,
      });
      await createCampaign(adv.id, campaignInput(creative.id, 30_000), {
        channel: 'api',
        apiKeyId,
      });

      const res = await app.request('/v1/api-keys/me', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        scope: string;
        purchase: {
          enabled: boolean;
          monthlyCapIsk: number;
          autoApproveLimitIsk: number;
          monthToDateSpentIsk: number;
          remainingCapIsk: number;
        } | null;
      };
      expect(body.scope).toBe('advertiser');
      expect(body.purchase).toMatchObject({
        enabled: true,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 100_000,
        monthToDateSpentIsk: 30_000,
        remainingCapIsk: 70_000,
      });
    });
  });

  describe('scope enforcement on REST routes', () => {
    it('rejects a publisher-scoped key from /v1/campaigns and /v1/creatives', async () => {
      const { key } = await issueApiKey('pubkey-scope@agent-purchase.test.is', 'publisher');

      const campaignsRes = await app.request('/v1/campaigns', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(campaignsRes.status).toBe(403);

      const creativesRes = await app.request('/v1/creatives', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(creativesRes.status).toBe(403);
    });

    it('rejects an advertiser-scoped key from /v1/publishers/me/slots', async () => {
      const { key } = await issueApiKey('advkey-scope@agent-purchase.test.is', 'advertiser');

      const res = await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('a both-scoped key (and Firebase ID tokens generally) is unaffected by scope enforcement', async () => {
      // An advertiser profile must exist first, or the route 404s on the
      // profile lookup before ever reaching the scope/purchase checks.
      await createAdvertiser({
        ownerEmail: 'bothkey-scope@agent-purchase.test.is',
        companyName: 'Both Scope Test ehf.',
        kennitala: '1234567890',
        vatNumber: '1',
      });
      const { key } = await issueApiKey('bothkey-scope@agent-purchase.test.is', 'both');

      // Not purchase-enabled, so campaign create still 403s — but for
      // PURCHASE_NOT_ENABLED, not the scope check, proving scope passed.
      const res = await app.request('/v1/campaigns', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('PURCHASE_NOT_ENABLED');
    });
  });
});
