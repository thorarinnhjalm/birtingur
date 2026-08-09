import { vi, describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth, db } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { COLLECTIONS, ledgerEntryConverter, payoutConverter } from '@ada/shared/firestore';
import { LedgerEntrySchema, PayoutSchema, MIN_PAYOUT_ISK } from '@ada/shared';
import type { Payout } from '@ada/shared';
import { generateId } from '../src/lib/id';

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

    async function seedDay(
      publisherId: string,
      impressions: number,
      clicks: number,
      pageViewsTrue?: number,
    ) {
      await db.doc(`stats/publishers/${publisherId}/${todayKey()}`).set({
        impressions,
        clicks,
        spendIsk: Math.round((impressions / 1000) * 550),
        pageviews: impressions * 2,
        // Only set when the caller passes it — the schema requires the field
        // to be genuinely ABSENT (not zero) on days with no measured true
        // traffic, same as the real stats-aggregator behavior (Task 4).
        ...(pageViewsTrue !== undefined ? { pageViewsTrue } : {}),
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

    it('rejects a publisherId owned by a different real publisher with 403', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      await createSite('vefur-a.is', 'Vefur A');

      // Seeded directly through `db` (not via POST /v1/publishers) because
      // the create endpoint always attributes the new doc to the caller's
      // own mocked identity — there's no way to create a second owner's
      // publisher through the HTTP API in this test setup. This is a REAL
      // publisher doc, distinct from the nonexistent-id case above: it
      // proves the ownership check filters on ownerEmail rather than merely
      // checking that the id resolves to *some* publisher.
      const otherOwnersPublisherId = 'pub_other_owner_test';
      await db
        .collection(COLLECTIONS.publishers)
        .doc(otherOwnersPublisherId)
        .set({
          ownerEmail: 'someone-else@example.is',
          domain: 'annar-vefur.is',
          displayName: 'Annar vefur',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          status: 'active',
          createdAt: new Date(),
          integrationPreference: 'widget',
          categories: ['matur'],
        });

      const res = await app.request(`/v1/publishers/stats?publisherId=${otherOwnersPublisherId}`, {
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

    it('sums pageViewsTrue across days and includes it per site in bySite', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const a = await createSite('vefur-a.is', 'Vefur A');
      const b = await createSite('vefur-b.is', 'Vefur B');
      await seedDay(a, 1000, 10, 400);
      await seedDay(b, 500, 5, 100);

      const res = await app.request('/v1/publishers/stats?timeframe=7', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pageViewsTrue).toBe(500);
      const siteA = body.bySite.find((s: any) => s.publisherId === a);
      const siteB = body.bySite.find((s: any) => s.publisherId === b);
      expect(siteA.pageViewsTrue).toBe(400);
      expect(siteB.pageViewsTrue).toBe(100);
    });

    it('leaves pageViewsTrue absent (not zero) when no day in the window has measured it', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const a = await createSite('vefur-a.is', 'Vefur A');
      // No pageViewsTrue arg: the day doc has `pageviews` (slot loads) but no
      // `pageViewsTrue` field at all, mirroring a pre-switch day.
      await seedDay(a, 100, 1);

      const res = await app.request('/v1/publishers/stats?timeframe=7', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.impressions).toBe(100);
      expect(body.pageViewsTrue).toBeUndefined();
    });
  });

  // IMPORTANT-5 (adversarial review): the real unpaid basis backing
  // Earnings.tsx's "Beðið eftir útgreiðslu" figure — computed the same way
  // generateMonthlyPayouts computes it (all publisher_credit to date minus
  // all payout docs' netIsk, any status), summed across every site the
  // caller owns.
  describe('GET /v1/publishers/me/balance', () => {
    async function creditPublisherLedger(publisherId: string, amountIsk: number) {
      const entry = LedgerEntrySchema.parse({
        id: generateId('ldg'),
        party: { type: 'publisher', id: publisherId },
        type: 'publisher_credit',
        amountIsk,
        relatedId: 'cmp_balance_test',
        createdAt: new Date(),
      });
      await db
        .collection(COLLECTIONS.ledger)
        .doc(entry.id)
        .withConverter(ledgerEntryConverter)
        .set(entry);
    }

    async function writePayoutDoc(
      id: string,
      publisherId: string,
      netIsk: number,
      status: Payout['status'],
    ) {
      const payout: Payout = PayoutSchema.parse({
        id,
        publisherId,
        periodStart: new Date(Date.UTC(2026, 6, 1)),
        periodEnd: new Date(Date.UTC(2026, 6, 31, 23, 59, 59)),
        grossIsk: netIsk,
        platformFeeIsk: 0,
        netIsk,
        vatIsk: 0,
        status,
        bankReference: status === 'completed' ? 'B-TEST' : '',
      });
      await db.collection(COLLECTIONS.payouts).doc(id).withConverter(payoutConverter).set(payout);
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

    it('returns 404 when the caller has no publisher profile', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      const res = await app.request('/v1/publishers/me/balance', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(404);
    });

    it('sums the unpaid basis across every site the caller owns', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const a = await createSite('vefur-balance-a.is', 'Vefur Balance A');
      const b = await createSite('vefur-balance-b.is', 'Vefur Balance B');
      await creditPublisherLedger(a, 6_000);
      await creditPublisherLedger(b, 5_000);

      const res = await app.request('/v1/publishers/me/balance', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unpaidBasisIsk).toBe(11_000);
      expect(body.minPayoutIsk).toBe(MIN_PAYOUT_ISK);
    });

    it('subtracts payout docs of ANY status from the basis, not just completed ones', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const a = await createSite('vefur-balance-c.is', 'Vefur Balance C');
      await creditPublisherLedger(a, 15_000);
      await writePayoutDoc('pay_balance_pending', a, 15_000, 'pending');
      // New credit lands after the (still-pending) payout doc was created.
      await creditPublisherLedger(a, 3_000);

      const res = await app.request('/v1/publishers/me/balance', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unpaidBasisIsk).toBe(3_000);
    });

    it('reflects a below-minimum basis honestly (not zeroed out) so Earnings can show its warning correctly', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const a = await createSite('vefur-balance-d.is', 'Vefur Balance D');
      await creditPublisherLedger(a, MIN_PAYOUT_ISK - 1);

      const res = await app.request('/v1/publishers/me/balance', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      const body = await res.json();
      expect(body.unpaidBasisIsk).toBe(MIN_PAYOUT_ISK - 1);
      expect(body.unpaidBasisIsk).toBeLessThan(body.minPayoutIsk);
    });
  });
});
