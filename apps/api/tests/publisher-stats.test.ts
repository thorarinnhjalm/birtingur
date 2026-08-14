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

describe('Publisher Stats HTTP Route', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    vi.resetAllMocks();
  });

  const mockUser = {
    uid: 'user-123',
    email: 'publisher@example.is',
    email_verified: true,
  };

  const samplePayout = {
    type: 'bank' as const,
    iban: 'IS260123456789012345678901',
    kennitala: '1234567890',
    accountName: 'Publisher ehf.',
  };

  const samplePolicy = {
    blockedCategories: [],
    requireManualApproval: false,
  };

  // Helper to register publisher profile
  async function createPublisherProfile() {
    vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
    const res = await app.request('/v1/publishers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        domain: 'publisher.is',
        displayName: 'My Publisher',
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['taekni'],
      }),
    });
    return res.json();
  }

  it('returns aggregated stats and history successfully', async () => {
    const publisher = await createPublisherProfile();
    const pubId = publisher.id;

    // Seed hourly stats documents in Firestore
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Seed yesterday's stats (hour 10)
    await db
      .collection(COLLECTIONS.stats)
      .doc(`${yesterdayStr}_10`)
      .set({
        impressions: 1000,
        clicks: 50,
        spendIsk: 500,
        byPublisher: {
          [pubId]: {
            impressions: 800,
            clicks: 40,
            spendIsk: 400,
          },
          other_pub: {
            impressions: 200,
            clicks: 10,
            spendIsk: 100,
          },
        },
      });

    // Seed today's stats (hour 14)
    await db
      .collection(COLLECTIONS.stats)
      .doc(`${todayStr}_14`)
      .set({
        impressions: 2000,
        clicks: 100,
        spendIsk: 1000,
        byPublisher: {
          [pubId]: {
            impressions: 1500,
            clicks: 75,
            spendIsk: 750,
          },
        },
      });

    // Request stats
    const res = await app.request('/v1/publishers/me/stats?timeframe=7', {
      headers: {
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Total checks
    expect(body.impressions).toBe(2300); // 800 (yesterday) + 1500 (today)
    expect(body.clicks).toBe(115); // 40 + 75
    // 1.265, not the 1.150 these fixtures store. Revenue is DERIVED from the
    // impression count at read time — round(2300 / 1000 * 550) — rather than
    // summed from the per-run figures the aggregator wrote, which round 0,55 kr
    // per impression to a whole króna every run and so overstate a small
    // publisher's month by up to 82%. (These fixtures happen to carry a 500 kr
    // CPM, which is why the two differ here at all.) The number the publisher
    // is actually PAID is the ledger balance on the payouts page; this one
    // answers what the traffic is worth.
    expect(body.spendIsk).toBe(1265);

    // History checks
    expect(body.history).toHaveLength(7);

    const todayEntry = body.history.find((h: any) => h.date === todayStr);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.impressions).toBe(1500);

    const yesterdayEntry = body.history.find((h: any) => h.date === yesterdayStr);
    expect(yesterdayEntry).toBeDefined();
    expect(yesterdayEntry.impressions).toBe(800);
  });
});
