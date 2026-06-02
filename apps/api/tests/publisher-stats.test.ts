import { vi, describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth, db } from '../src/lib/firebase';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';

vi.mock('../src/lib/firebase', () => {
  return {
    auth: {
      verifyIdToken: vi.fn(),
    },
    db: {},
    storage: {},
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
    await db.collection(COLLECTIONS.stats).doc(`${yesterdayStr}_10`).set({
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
    await db.collection(COLLECTIONS.stats).doc(`${todayStr}_14`).set({
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
    expect(body.spendIsk).toBe(1150); // 400 + 750

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
