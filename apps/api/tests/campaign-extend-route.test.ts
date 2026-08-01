import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import { createCampaign, getCampaign, sweepExpiredCampaigns } from '../src/services/campaigns';
import { topUp } from '../src/services/wallet';
import { issueApiKey } from '../src/services/api-keys';
import type { Advertiser, Creative } from '@ada/shared';

import type * as firebaseModule from '../src/lib/firebase';

vi.mock('../src/lib/firebase', async (importOriginal) => {
  const original = await importOriginal<typeof firebaseModule>();
  return {
    ...original,
    auth: {
      ...original.auth,
      verifyIdToken: vi.fn(),
    },
  };
});

const OWNER = 'adv@extend-route.test.is';

function asDashboardUser() {
  // email_verified: true is required by requireAuth (apps/api/src/lib/auth.ts)
  // — every other suite's mock sets it; the brief's snippet omitted it.
  vi.mocked(auth.verifyIdToken).mockResolvedValue({
    email: OWNER,
    email_verified: true,
  } as never);
}

const tomorrowISO = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

async function seedFundedAdvertiser(balanceIsk: number): Promise<{
  adv: Advertiser;
  creative: Creative;
}> {
  const adv = await createAdvertiser({
    ownerEmail: OWNER,
    companyName: 'Extend Route Test ehf.',
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

/** Create a campaign on an expired flight and sweep it to `completed`. */
async function seedCompletedCampaign(adv: Advertiser, creative: Creative, totalIsk: number) {
  const cmp = await createCampaign(
    adv.id,
    {
      creativeIds: [creative.id],
      categories: ['matur'],
      schedule: {
        // already-expired flight so sweepExpiredCampaigns completes it
        startsAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
        endsAt: new Date(Date.now() - 24 * 3600 * 1000),
      },
      budget: { mode: 'cpm_capped', totalIsk },
    },
    { channel: 'dashboard' },
  );
  await sweepExpiredCampaigns();
  const swept = await getCampaign(cmp.id);
  expect(swept!.status).toBe('completed');
  return swept!;
}

describe('POST /v1/campaigns/:id/extend', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await clearFirestoreEmulator();
  });

  it('extends a completed campaign for a dashboard user', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000); // ownerEmail: OWNER
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    asDashboardUser();

    const res = await app.request(`/v1/campaigns/${cmp.id}/extend`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ endsAt: tomorrowISO() }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('active');
  });

  it('rejects ak_ API keys with 403', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    const { key } = await issueApiKey(OWNER, 'both');

    const res = await app.request(`/v1/campaigns/${cmp.id}/extend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endsAt: tomorrowISO() }),
    });

    expect(res.status).toBe(403);
  });

  it('400s on a missing endsAt body', async () => {
    const { adv, creative } = await seedFundedAdvertiser(10_000);
    const cmp = await seedCompletedCampaign(adv, creative, 10_000);
    asDashboardUser();

    const res = await app.request(`/v1/campaigns/${cmp.id}/extend`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('404s on an unknown campaign id', async () => {
    await seedFundedAdvertiser(10_000);
    asDashboardUser();

    const res = await app.request('/v1/campaigns/cmp_doesnotexist/extend', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ endsAt: tomorrowISO() }),
    });

    expect(res.status).toBe(404);
  });
});
