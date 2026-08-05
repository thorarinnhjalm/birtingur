import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS, ledgerEntryConverter } from '@ada/shared/firestore';
import { clearFirestoreEmulator, retryOnEmulatorContention } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import {
  createCampaign,
  updateCampaign,
  updateCampaignStatus,
  getCampaign,
  sweepExpiredCampaigns,
  type CreateCampaignInput,
} from '../src/services/campaigns';
import { topUp, chargeCampaign, getAvailableBalance } from '../src/services/wallet';
import { adminReview } from '../src/services/approvals';
import type { Advertiser, Creative } from '@ada/shared';

// Committed-funds ("reservation") gate: an advertiser's committed amount is
// the sum of budget.remainingIsk over their fund-holding campaigns (every
// CampaignStatus except `completed` — see FUND_HOLDING_STATUSES in
// src/services/wallet.ts). Available = ledger balance − committed. These
// tests run against the real Firestore emulator (not a mocked db) because
// the whole point is to exercise genuine transaction semantics — including
// the retry-on-conflict behavior that makes the concurrency test meaningful.

describe('Committed-funds wallet reservation', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  async function seedFundedAdvertiser(balanceIsk: number): Promise<{
    adv: Advertiser;
    creative: Creative;
  }> {
    const adv = await createAdvertiser({
      ownerEmail: 'adv@wallet-reservation.test.is',
      companyName: 'Reservation Test ehf.',
      kennitala: '1234567890',
      vatNumber: '1',
    });
    if (balanceIsk > 0) {
      await topUp(adv.id, balanceIsk, `topup_${adv.id}`);
    }
    const creative = await createCreative(
      adv.id,
      {
        imageUrl: 'https://example.com/a.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is/saett', // clean URL -> auto_approved
      },
      new StubAutoScanner(),
    );
    return { adv, creative };
  }

  function campaignInput(creativeId: string, totalIsk: number): CreateCampaignInput {
    return {
      creativeIds: [creativeId],
      categories: ['matur'],
      schedule: {
        startsAt: new Date(Date.now() + 1000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
      budget: { mode: 'cpm_capped', totalIsk },
    };
  }

  // Schedule validation only requires endsAt > startsAt (see ScheduleSchema
  // in packages/shared) — nothing stops both from being in the past, which
  // is exactly what an already-expired campaign looks like.
  function expiredCampaignInput(creativeId: string, totalIsk: number): CreateCampaignInput {
    return {
      creativeIds: [creativeId],
      categories: ['matur'],
      schedule: {
        startsAt: new Date(Date.now() - 2 * 86_400_000),
        endsAt: new Date(Date.now() - 86_400_000),
      },
      budget: { mode: 'cpm_capped', totalIsk },
    };
  }

  it('gates campaign creation on the wallet available balance across sibling campaigns', async () => {
    const { adv, creative } = await seedFundedAdvertiser(100_000);

    const a = await createCampaign(adv.id, campaignInput(creative.id, 60_000));
    expect(a.status).toBe('active');

    await expect(createCampaign(adv.id, campaignInput(creative.id, 60_000))).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });

    const b = await createCampaign(adv.id, campaignInput(creative.id, 40_000));
    expect(b.budget.totalIsk).toBe(40_000);

    const { availableIsk } = await getAvailableBalance(adv.id);
    expect(availableIsk).toBe(0);
  });

  it('gates budget increases the same way, but never gates reductions', async () => {
    const { adv, creative } = await seedFundedAdvertiser(100_000);

    const a = await createCampaign(adv.id, campaignInput(creative.id, 60_000));
    await createCampaign(adv.id, campaignInput(creative.id, 20_000));
    // available = 100_000 - 60_000 - 20_000 = 20_000

    await expect(updateCampaign(a.id, { budget: { totalIsk: 90_000 } })).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });

    // 60_000 -> 80_000 is a +20_000 increase, which fits the 20_000 available
    // (a's own current remainingIsk is excluded from "committed to others").
    const increased = await updateCampaign(a.id, { budget: { totalIsk: 80_000 } });
    expect(increased.budget.totalIsk).toBe(80_000);

    // Reducing back down must never require balance.
    const reduced = await updateCampaign(a.id, { budget: { totalIsk: 10_000 } });
    expect(reduced.budget.totalIsk).toBe(10_000);
  });

  it('releases a campaign hold once it is marked completed', async () => {
    const { adv, creative } = await seedFundedAdvertiser(100_000);

    const a = await createCampaign(adv.id, campaignInput(creative.id, 60_000));
    await expect(createCampaign(adv.id, campaignInput(creative.id, 60_000))).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });

    await updateCampaignStatus(a.id, 'completed');

    const b = await createCampaign(adv.id, campaignInput(creative.id, 60_000));
    expect(b.status).toBe('active');
  });

  it('releases a campaign hold when its sole creative is rejected, without minting a refund', async () => {
    const { adv, creative } = await seedFundedAdvertiser(100_000);

    // A bit.ly clickUrl is flagged for manual review by StubAutoScanner, so
    // the creative — and therefore the campaign that only references it —
    // starts out pending_approval, still holding its full budget.
    const flaggedCreative = await createCreative(
      adv.id,
      {
        imageUrl: 'https://example.com/b.png',
        width: 728,
        height: 90,
        clickUrl: 'https://bit.ly/x123',
      },
      new StubAutoScanner(),
    );
    expect(flaggedCreative.reviewStatus).toBe('pending');

    const cmp = await createCampaign(adv.id, campaignInput(flaggedCreative.id, 60_000));
    expect(cmp.status).toBe('pending_approval');

    const before = await getAvailableBalance(adv.id);
    expect(before.availableIsk).toBe(40_000); // 100_000 - 60_000 committed

    await adminReview(flaggedCreative.id, { action: 'reject', adminEmail: 'admin@a.is' });

    // Status change alone releases the hold — no ledger `refund` entry.
    const after = await getAvailableBalance(adv.id);
    expect(after).toMatchObject({ balanceIsk: 100_000, committedIsk: 0, availableIsk: 100_000 });

    const ledgerSnap = await db
      .collection(COLLECTIONS.ledger)
      .where('party.type', '==', 'advertiser')
      .where('party.id', '==', adv.id)
      .withConverter(ledgerEntryConverter)
      .get();
    const refundEntries = ledgerSnap.docs.map((d) => d.data()).filter((e) => e.type === 'refund');
    expect(refundEntries).toHaveLength(0);

    // The released budget can now fund a fresh campaign (using the
    // advertiser's other, already-approved creative — the flagged one is
    // `rejected` now and can no longer be attached to a new campaign).
    const b = await createCampaign(adv.id, campaignInput(creative.id, 60_000));
    expect(b.status).toBe('active');
  });

  // Both contenders are wrapped in retryOnEmulatorContention (see
  // helpers/emulator.ts): the emulator surfaces its lock-timeout abort with a
  // wording the SDK does not auto-retry, unlike production Firestore. The
  // retried loser re-reads the winner's campaign and fails clean with
  // INSUFFICIENT_FUNDS, exactly like the SDK's own retry against the real
  // backend. Test timeout raised to 45s: each emulator contention round costs
  // ~3-4.5s and the artifact retries can stack a few of them — the default
  // 20s testTimeout was itself a flake source under full-suite load.
  it('lets exactly one of two concurrent creates through when they would jointly oversubscribe the wallet', async () => {
    const { adv, creative } = await seedFundedAdvertiser(100_000);

    const results = await Promise.allSettled([
      retryOnEmulatorContention(() => createCampaign(adv.id, campaignInput(creative.id, 60_000))),
      retryOnEmulatorContention(() => createCampaign(adv.id, campaignInput(creative.id, 60_000))),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createCampaign>>> =>
        r.status === 'fulfilled',
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    const { availableIsk } = await getAvailableBalance(adv.id);
    expect(availableIsk).toBe(40_000);
  }, 45_000);

  it('keeps available balance invariant under spend accrual, still allowing a campaign that fits', async () => {
    const { adv, creative } = await seedFundedAdvertiser(100_000);
    const a = await createCampaign(adv.id, campaignInput(creative.id, 60_000));

    const before = await getAvailableBalance(adv.id);
    expect(before).toMatchObject({
      balanceIsk: 100_000,
      committedIsk: 60_000,
      availableIsk: 40_000,
    });

    // Simulate spend accrual the way drainAndAccrue does: charge the wallet
    // (decrements ledger balance) and decrement the campaign's remainingIsk
    // by the same amount (decrements committed) — both sides of "available"
    // move together, so it should be unchanged.
    const chargeIsk = 10_000;
    await chargeCampaign(adv.id, a.id, chargeIsk);
    await db
      .collection(COLLECTIONS.campaigns)
      .doc(a.id)
      .update({ 'budget.remainingIsk': 60_000 - chargeIsk });

    const after = await getAvailableBalance(adv.id);
    expect(after).toMatchObject({
      balanceIsk: 100_000 - chargeIsk,
      committedIsk: 60_000 - chargeIsk,
      availableIsk: 40_000,
    });

    // A campaign that fits the (unchanged) available amount still succeeds.
    const b = await createCampaign(adv.id, campaignInput(creative.id, 40_000));
    expect(b.budget.totalIsk).toBe(40_000);

    await expect(createCampaign(adv.id, campaignInput(creative.id, 1))).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });
  });

  // Fix 1: nothing else in production ever transitions a campaign to
  // `completed` when schedule.endsAt passes, so its fund hold would be
  // permanent without (a) the expiry sweep and (b) the belt-and-braces
  // exclusion in wallet.ts's committed-sum logic.
  describe('campaign expiry releases the fund hold', () => {
    it('excludes an already-expired campaign from committed funds even before the sweep runs', async () => {
      const { adv, creative } = await seedFundedAdvertiser(100_000);

      const expired = await createCampaign(adv.id, expiredCampaignInput(creative.id, 60_000));
      // Still `active` by status — nothing has swept it yet.
      expect(expired.status).toBe('active');

      // Despite status still being fund-holding, the belt-and-braces
      // endsAt-in-the-past exclusion in wallet.ts already frees the hold.
      const { availableIsk } = await getAvailableBalance(adv.id);
      expect(availableIsk).toBe(100_000);

      // Proof it's not just a lucky number: a campaign for the FULL balance
      // succeeds, which would be impossible if 60_000 were still committed.
      const b = await createCampaign(adv.id, campaignInput(creative.id, 100_000));
      expect(b.budget.totalIsk).toBe(100_000);
    });

    it('sweepExpiredCampaigns transitions expired fund-holding campaigns to completed and leaves others alone', async () => {
      const { adv, creative } = await seedFundedAdvertiser(100_000);

      const expired = await createCampaign(adv.id, expiredCampaignInput(creative.id, 60_000));
      const stillActive = await createCampaign(adv.id, campaignInput(creative.id, 20_000));

      const swept = await sweepExpiredCampaigns();
      expect(swept).toBe(1);

      const expiredAfter = await getCampaign(expired.id);
      expect(expiredAfter!.status).toBe('completed');
      // The sweep only changes status — it doesn't zero remainingIsk (that's
      // the sole-creative-rejection path in approvals.ts, a different case).
      expect(expiredAfter!.budget.remainingIsk).toBe(60_000);

      const stillActiveAfter = await getCampaign(stillActive.id);
      expect(stillActiveAfter!.status).toBe('active');

      // Only the still-active campaign's 20_000 remains committed.
      const { availableIsk } = await getAvailableBalance(adv.id);
      expect(availableIsk).toBe(80_000);

      // Re-running the sweep is a no-op — nothing left to sweep.
      expect(await sweepExpiredCampaigns()).toBe(0);
    });
  });

  // Fix 5: a completed campaign has already released its fund hold; flipping
  // it back to a fund-holding status must not silently re-acquire that hold
  // without ever passing the committed-funds gate again.
  describe('completed campaigns cannot be reactivated', () => {
    it('rejects via updateCampaignStatus', async () => {
      const { adv, creative } = await seedFundedAdvertiser(100_000);
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 60_000));
      await updateCampaignStatus(cmp.id, 'completed');

      await expect(updateCampaignStatus(cmp.id, 'active')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(updateCampaignStatus(cmp.id, 'paused')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('rejects via updateCampaign', async () => {
      const { adv, creative } = await seedFundedAdvertiser(100_000);
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 60_000));
      await updateCampaignStatus(cmp.id, 'completed');

      await expect(updateCampaign(cmp.id, { status: 'active' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  // Fix 3: updateCampaign used to build whole-document writes from a stale
  // `existing` read taken before any transaction, so a concurrent accrual
  // decrement to budget.remainingIsk between that read and the write got
  // silently reverted. It now always re-reads the campaign fresh inside a
  // transaction before computing what to write.
  describe('updateCampaign does not clobber a concurrent accrual write', () => {
    it('a non-budget patch (rename) leaves an out-of-band remainingIsk decrement intact', async () => {
      const { adv, creative } = await seedFundedAdvertiser(100_000);
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 60_000));

      // Simulate accrual landing between the caller's read of the campaign
      // and this patch — decrement remainingIsk by 30_000 out of band.
      await db
        .collection(COLLECTIONS.campaigns)
        .doc(cmp.id)
        .update({ 'budget.remainingIsk': 60_000 - 30_000 });

      const renamed = await updateCampaign(cmp.id, { name: 'Uppfært heiti' });
      expect(renamed.name).toBe('Uppfært heiti');
      expect(renamed.budget.remainingIsk).toBe(30_000);

      const persisted = await getCampaign(cmp.id);
      expect(persisted!.budget.remainingIsk).toBe(30_000);
      expect(persisted!.name).toBe('Uppfært heiti');
    });

    it('a budget increase computes the new remaining from a fresh spent, not a stale one', async () => {
      const { adv, creative } = await seedFundedAdvertiser(100_000);
      const cmp = await createCampaign(adv.id, campaignInput(creative.id, 60_000));

      // Simulate a 30_000 accrual charge landing out of band before the
      // increase's own transaction does its fresh read.
      await db
        .collection(COLLECTIONS.campaigns)
        .doc(cmp.id)
        .update({ 'budget.remainingIsk': 60_000 - 30_000 });

      // 60_000 -> 80_000 is a +20_000 increase. If `spent` were computed from
      // the stale pre-accrual remainingIsk (spent=0), the new remaining would
      // wrongly be 80_000. The correct fresh spent is 30_000, so the new
      // remaining must be 80_000 - 30_000 = 50_000.
      const increased = await updateCampaign(cmp.id, { budget: { totalIsk: 80_000 } });
      expect(increased.budget.totalIsk).toBe(80_000);
      expect(increased.budget.remainingIsk).toBe(50_000);

      const persisted = await getCampaign(cmp.id);
      expect(persisted!.budget.totalIsk).toBe(80_000);
      expect(persisted!.budget.remainingIsk).toBe(50_000);
    });
  });
});
