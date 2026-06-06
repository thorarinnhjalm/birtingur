import { vi, describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
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

describe('Slot HTTP Routes', () => {
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

  const samplePricing = {
    mode: 'cpm' as const,
    cpmIsk: 150,
  };

  const samplePlacement = {
    pageMatcher: '/*',
    position: 'sidebar' as const,
  };

  const sampleSizes = [{ width: 300, height: 250 }];

  async function createPublisherProfile() {
    vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
    await app.request('/v1/publishers', {
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
  }

  describe('POST /v1/publishers/me/slots', () => {
    it('creates a new slot for the authenticated publisher', async () => {
      await createPublisherProfile();

      const res = await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Sidubar 1',
          sizes: sampleSizes,
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toMatch(/^slot_[a-f0-9]{24}$/);
      expect(body.publisherId).toMatch(/^pub_[a-f0-9]{24}$/);
      expect(body.name).toBe('Sidubar 1');
    });

    it('returns 404 if publisher profile is not set up', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      const res = await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Sidubar 1',
          sizes: sampleSizes,
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/publishers/me/slots', () => {
    it('returns list of slots for current publisher', async () => {
      await createPublisherProfile();

      // Create two slots
      await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Slot A',
          sizes: sampleSizes,
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      });

      await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Slot B',
          sizes: sampleSizes,
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      });

      const res = await app.request('/v1/publishers/me/slots', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body.map((s: any) => s.name)).toContain('Slot A');
      expect(body.map((s: any) => s.name)).toContain('Slot B');
    });
  });

  describe('PATCH /v1/publishers/me/slots/:id', () => {
    it('updates the slot details', async () => {
      await createPublisherProfile();

      const createRes = await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Old Name',
          sizes: sampleSizes,
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      });
      const createdSlot = await createRes.json();

      const res = await app.request(`/v1/publishers/me/slots/${createdSlot.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'New Name',
          status: 'paused',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('New Name');
      expect(body.status).toBe('paused');
    });
  });

  describe('GET /v1/publishers/me/slots/:id/snippet', () => {
    it('returns the HTML snippet for the slot', async () => {
      await createPublisherProfile();

      const createRes = await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Old Name',
          sizes: [{ width: 728, height: 90 }],
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      });
      const createdSlot = await createRes.json();

      const res = await app.request(`/v1/publishers/me/slots/${createdSlot.id}/snippet`, {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.snippet).toContain(`data-adplatform-slot="${createdSlot.id}"`);
      expect(body.snippet).toContain('data-adplatform-width="728"');
      expect(body.snippet).toContain('data-adplatform-height="90"');
    });

    it('allows requesting snippet with specific query dimensions', async () => {
      await createPublisherProfile();

      const createRes = await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Old Name',
          sizes: [
            { width: 300, height: 250 },
            { width: 728, height: 90 },
          ],
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      });
      const createdSlot = await createRes.json();

      const res = await app.request(
        `/v1/publishers/me/slots/${createdSlot.id}/snippet?width=728&height=90`,
        {
          headers: {
            Authorization: 'Bearer valid-token',
          },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.snippet).toContain('data-adplatform-width="728"');
      expect(body.snippet).toContain('data-adplatform-height="90"');
    });
  });

  describe('GET /v1/publishers/me/slots/:id/stats', () => {
    it('returns per-slot stats (bare) for the owning publisher', async () => {
      await createPublisherProfile();

      // Create a slot
      const createRes = await app.request('/v1/publishers/me/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          name: 'Stat Slot',
          sizes: sampleSizes,
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      });
      const createdSlot = await createRes.json();

      const res = await app.request(`/v1/publishers/me/slots/${createdSlot.id}/stats?timeframe=7`, {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('impressions');
      expect(body).toHaveProperty('clicks');
      expect(body).toHaveProperty('spendIsk');
      expect(body).toHaveProperty('pageviews');
      expect(body).toHaveProperty('history');
    });

    it('returns 404 for a slot the caller does not own', async () => {
      await createPublisherProfile();

      const res = await app.request('/v1/publishers/me/slots/slot_other/stats', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(404);
    });
  });
});
