import { describe, it, expect, beforeEach } from 'vitest';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';
import { db } from '../src/lib/firebase';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import {
  createCampaign,
  getCampaign,
  sweepExpiredCampaigns,
  type CreateCampaignInput,
} from '../src/services/campaigns';
import { topUp } from '../src/services/wallet';

// sweepExpiredCampaigns runs on the 10-minute cron BEFORE
// refreshAllActiveSlotCaches (api/cron-refresh-cache.js). Campaign docs are
// read through campaignConverter, which Zod-parses on `doc.data()`, so a
// single malformed document throws. If that abort propagates, the cache
// refresh never runs, every `budget:{id}` key expires on its 1h TTL, and the
// fail-closed serve-time gate then reads them as 0 — all ads stop on every
// publisher site. One bad document must not be able to do that.

describe('sweepExpiredCampaigns resilience', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  function expiredInput(creativeId: string, totalIsk: number): CreateCampaignInput {
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

  it('sweeps the healthy expired campaigns even when a malformed campaign doc is present', async () => {
    const adv = await createAdvertiser({
      ownerEmail: 'adv@sweep-resilience.test.is',
      companyName: 'Sweep Test ehf.',
      kennitala: '1234567890',
      vatNumber: '1',
    });
    await topUp(adv.id, 100_000, `topup_${adv.id}`);
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

    const healthy = await createCampaign(adv.id, expiredInput(creative.id, 10_000));

    // A document the converter cannot parse: written raw, so it bypasses the
    // schema on write but is picked up by the sweep's status query.
    await db.collection(COLLECTIONS.campaigns).doc('cmp_broken').set({
      status: 'active',
      advertiserId: adv.id,
    });

    const swept = await sweepExpiredCampaigns();

    expect(swept).toBe(1);
    expect((await getCampaign(healthy.id))!.status).toBe('completed');
  });
});
