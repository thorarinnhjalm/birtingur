import { vi, describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth, db } from '../src/lib/firebase';
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

describe('Publisher HTTP Routes', () => {
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
    blockedCategories: ['vedmal'],
    requireManualApproval: false,
  };

  describe('POST /v1/publishers', () => {
    it('creates a publisher and returns 201', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      const res = await app.request('/v1/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          domain: 'publisher.is',
          displayName: 'My Publisher Website',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['taekni'],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toMatch(/^pub_[a-f0-9]{24}$/);
      expect(body.ownerEmail).toBe('publisher@example.is');
      expect(body.domain).toBe('publisher.is');
    });

    it('returns 409 if publisher domain already exists', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      // Create first
      await app.request('/v1/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          domain: 'publisher.is',
          displayName: 'My Publisher Website',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['taekni'],
        }),
      });

      // Try creating second with same domain
      const res = await app.request('/v1/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          domain: 'publisher.is',
          displayName: 'Another Website',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['taekni'],
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('CONFLICT');
    });
  });

  describe('GET /v1/publishers/me', () => {
    it('returns the current publisher details', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      // Seed db first
      await app.request('/v1/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          domain: 'publisher.is',
          displayName: 'My Publisher Website',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['taekni'],
        }),
      });

      const res = await app.request('/v1/publishers/me', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.domain).toBe('publisher.is');
      expect(body.ownerEmail).toBe('publisher@example.is');
    });

    it('returns 404 if publisher profile is not setup', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      const res = await app.request('/v1/publishers/me', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /v1/publishers/me', () => {
    it('updates publisher profile successfully', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      // Seed db first
      await app.request('/v1/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          domain: 'publisher.is',
          displayName: 'My Publisher Website',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['taekni'],
        }),
      });

      const res = await app.request('/v1/publishers/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          displayName: 'Updated Publisher Name',
          domain: 'updated-publisher.is',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe('Updated Publisher Name');
      expect(body.domain).toBe('updated-publisher.is');
    });

    it('persists contentPolicy.blockedCategories on publisher self-update', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      // Seed db first
      await app.request('/v1/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          domain: 'publisher.is',
          displayName: 'My Publisher Website',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['taekni'],
        }),
      });

      const res = await app.request('/v1/publishers/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          contentPolicy: {
            blockedCategories: ['afengi', 'tobak_veip'],
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contentPolicy.blockedCategories).toEqual(['afengi', 'tobak_veip']);
    });
  });

  describe('GET /v1/publishers/stats site filter', () => {
    function todayKey(): string {
      return new Date().toISOString().split('T')[0]!.replace(/-/g, '');
    }

    async function createSite(domain: string, displayName: string): Promise<string> {
      const res = await app.request('/v1/publishers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({
          domain,
          displayName,
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['matur'],
        }),
      });
      expect(res.status).toBe(201);
      return (await res.json()).id;
    }

    async function seedDay(publisherId: string, impressions: number, clicks: number) {
      await db.doc(`stats/publishers/${publisherId}/${todayKey()}`).set({
        impressions,
        clicks,
        spendIsk: Math.round((impressions / 1000) * 550),
        pageviews: impressions * 2,
      });
    }

    it('returns bySite subtotals for a multi-site owner and none for single-site', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const a = await createSite('vefur-a.is', 'Vefur A');
      const b = await createSite('vefur-b.is', 'Vefur B');
      await seedDay(a, 1000, 10);
      await seedDay(b, 500, 5);

      const res = await app.request('/v1/publishers/stats?timeframe=7', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.impressions).toBe(1500);
      expect(body.bySite).toHaveLength(2);
      const siteA = body.bySite.find((s: any) => s.publisherId === a);
      expect(siteA).toMatchObject({
        displayName: 'Vefur A',
        domain: 'vefur-a.is',
        impressions: 1000,
        clicks: 10,
      });
    });

    it('filters to one owned site via ?publisherId=', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const a = await createSite('vefur-a.is', 'Vefur A');
      const b = await createSite('vefur-b.is', 'Vefur B');
      await seedDay(a, 1000, 10);
      await seedDay(b, 500, 5);

      const res = await app.request(`/v1/publishers/stats?timeframe=7&publisherId=${b}`, {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.impressions).toBe(500);
      expect(body.bySite).toBeUndefined();
    });

    it('rejects a publisherId the caller does not own with 403', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      await createSite('vefur-a.is', 'Vefur A');

      const res = await app.request('/v1/publishers/stats?publisherId=pub_someone_elses', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(403);
    });

    it('omits bySite for a single-site owner', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const a = await createSite('vefur-a.is', 'Vefur A');
      await seedDay(a, 100, 1);

      const res = await app.request('/v1/publishers/stats?timeframe=7', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      const body = await res.json();
      expect(body.impressions).toBe(100);
      expect(body.bySite).toBeUndefined();
    });
  });
});
