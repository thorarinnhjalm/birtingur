import { describe, it, expect, beforeEach } from 'vitest';
import { clearFirestoreEmulator, retryOnEmulatorContention } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import {
  createCampaign,
  extendCampaign,
  getCampaign,
  sweepExpiredCampaigns,
  type CreateCampaignInput,
} from '../src/services/campaigns';
import { topUp } from '../src/services/wallet';
import { db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import type { Advertiser, Creative } from '@ada/shared';

describe('extendCampaign', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  async function seedFundedAdvertiser(balanceIsk: number): Promise<{
    adv: Advertiser;
    creative: Creative;
  }> {
    const adv = await createAdvertiser({
      ownerEmail: 'adv@campaign-extend.test.is',
      companyName: 'Extend Test ehf.',
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
        clickUrl: 'https://blomabud.is/saett',
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
        // already-expired flight so sweepExpiredCampaigns completes it
        startsAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
        endsAt: new Date(Date.now() - 24 * 3600 * 1000),
      },
      budget: { mode: 'cpm_capped', totalIsk },
    };
  }

  /** Create a campaign on an expired flight and sweep it to `completed`. */
  async function seedCompletedCampaign(adv: Advertiser, creative: Creative, totalIsk: number) {
    const cmp = await createCampaign(adv.id, campaignInput(creative.id, totalIsk), {
      channel: 'dashboard',
    });
    await sweepExpiredCampaigns();
    const swept = await getCampaign(cmp.id);
    expect(swept!.status).toBe('completed');
    return swept!;
  }

  const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000);

  it('reactivates a completed campaign with leftover budget', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);

    const newEndsAt = tomorrow();
    const extended = await extendCampaign(cmp.id, adv.id, newEndsAt);

    expect(extended.status).toBe('active');
    expect(extended.schedule.endsAt.getTime()).toBe(newEndsAt.getTime());
    const persisted = await getCampaign(cmp.id);
    expect(persisted!.status).toBe('active');
    expect(persisted!.budget.remainingIsk).toBe(10_000);
  });

  it('rejects when another campaign holds the funds', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const expired = await seedCompletedCampaign(adv, creative, 10_000);
    // Completion released the hold — this second campaign takes it all.
    await createCampaign(
      adv.id,
      {
        ...campaignInput(creative.id, 10_000),
        schedule: {
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      },
      { channel: 'dashboard' },
    );

    await expect(extendCampaign(expired.id, adv.id, tomorrow())).rejects.toMatchObject({
      statusCode: 400,
      code: 'INSUFFICIENT_FUNDS',
    });
    expect((await getCampaign(expired.id))!.status).toBe('completed');
  });

  it('rejects when the campaign has no remaining budget', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    // Zero the leftover directly: accrual (not chargeCampaign) is what
    // decrements remainingIsk in production, and running the whole accrual
    // pipeline here would test the wrong unit.
    await db.collection(COLLECTIONS.campaigns).doc(cmp.id).update({ 'budget.remainingIsk': 0 });

    await expect(extendCampaign(cmp.id, adv.id, tomorrow())).rejects.toMatchObject({
      statusCode: 400,
      code: 'NO_REMAINING_BUDGET',
    });
  });

  it('rejects a campaign that is not completed', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await createCampaign(
      adv.id,
      {
        ...campaignInput(creative.id, 10_000),
        schedule: {
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      },
      { channel: 'dashboard' },
    );

    await expect(extendCampaign(cmp.id, adv.id, tomorrow())).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects a past endsAt', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);

    await expect(
      extendCampaign(cmp.id, adv.id, new Date(Date.now() - 3600 * 1000)),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects another advertiser's campaign", async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    const other = await createAdvertiser({
      ownerEmail: 'other@campaign-extend.test.is',
      companyName: 'Other ehf.',
      kennitala: '0987654321',
      vatNumber: '2',
    });

    await expect(extendCampaign(cmp.id, other.id, tomorrow())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // Both contenders are wrapped in retryOnEmulatorContention (see
  // helpers/emulator.ts) so the emulator's non-retryable lock-timeout wording
  // can't kill both arms and leave `fulfilled` empty; timeout raised to 45s
  // because each emulator contention round costs ~3-4.5s.
  it('serializes extend against a concurrent create (oversubscription race)', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const expired = await seedCompletedCampaign(adv, creative, 10_000);

    const results = await Promise.allSettled([
      retryOnEmulatorContention(() => extendCampaign(expired.id, adv.id, tomorrow())),
      retryOnEmulatorContention(() =>
        createCampaign(
          adv.id,
          {
            ...campaignInput(creative.id, 10_000),
            schedule: {
              startsAt: new Date(),
              endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
            },
          },
          { channel: 'dashboard' },
        ),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1); // wallet covers exactly one of the two
  }, 45_000);
});
