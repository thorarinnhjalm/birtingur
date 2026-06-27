import { vi, describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth, db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';

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

describe('Advertiser and Campaign Stats custom range routing', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    vi.resetAllMocks();
  });

  const mockUser = {
    uid: 'user-456',
    email: 'adv@test.is',
    email_verified: true,
  };

  async function setupAdvertiserAndCampaign() {
    vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

    // Create advertiser directly in Firestore for simplicity
    const advId = 'adv-123';
    await db.collection(COLLECTIONS.advertisers).doc(advId).set({
      id: advId,
      ownerEmail: mockUser.email,
      companyName: 'Test Adv Co',
      kennitala: '1234567890',
      vatNumber: '12345',
      walletBalanceIsk: 0,
      status: 'active',
      createdAt: new Date(),
    });

    const campaignId = 'camp-999';
    await db
      .collection(COLLECTIONS.campaigns)
      .doc(campaignId)
      .set({
        id: campaignId,
        advertiserId: advId,
        name: 'Autumn Sale',
        creativeIds: ['creative-123'],
        targeting: { categories: ['matur'] },
        schedule: {
          startsAt: new Date('2026-06-01T00:00:00.000Z'),
          endsAt: new Date('2026-06-30T23:59:59.000Z'),
        },
        budget: {
          mode: 'cpm_capped',
          totalIsk: 100000,
          remainingIsk: 95000,
        },
        status: 'active',
      });

    return { advId, campaignId };
  }

  it('queries advertiser stats within custom dates successfully', async () => {
    const { campaignId } = await setupAdvertiserAndCampaign();

    // Seed stats for custom dates
    // 2026-06-05
    await db.collection(`${COLLECTIONS.stats}/campaigns/${campaignId}`).doc('2026060512').set({
      impressions: 5000,
      clicks: 150,
    });

    // 2026-06-12
    await db.collection(`${COLLECTIONS.stats}/campaigns/${campaignId}`).doc('2026061214').set({
      impressions: 7000,
      clicks: 250,
    });

    // Outside the range (2026-06-20)
    await db.collection(`${COLLECTIONS.stats}/campaigns/${campaignId}`).doc('2026062015').set({
      impressions: 12000,
      clicks: 400,
    });

    // Query stats with date range 2026-06-01 to 2026-06-15
    const res = await app.request(
      '/v1/advertisers/me/stats?startDate=2026-06-01&endDate=2026-06-15',
      {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // Impressions should be 5000 + 7000 = 12000 (excluding 12000 outside)
    expect(body.impressions).toBe(12000);
    expect(body.clicks).toBe(400); // 150 + 250

    // History days should cover exactly 15 days (June 1st to June 15th)
    expect(body.history).toHaveLength(15);
  });

  it('queries campaign stats within custom dates successfully', async () => {
    const { campaignId } = await setupAdvertiserAndCampaign();

    // Seed stats
    await db.collection(`${COLLECTIONS.stats}/campaigns/${campaignId}`).doc('2026060512').set({
      impressions: 5000,
      clicks: 150,
    });

    await db.collection(`${COLLECTIONS.stats}/campaigns/${campaignId}`).doc('2026062015').set({
      impressions: 12000,
      clicks: 400,
    });

    const res = await app.request(
      `/v1/campaigns/${campaignId}/stats?startDate=2026-06-01&endDate=2026-06-10`,
      {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // Should only contain the 2026-06-05 hour stats
    expect(body.impressions).toBe(5000);
    expect(body.clicks).toBe(150);
  });
});
