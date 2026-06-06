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

describe('Publisher HTTP Routes', () => {
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
    blockedCategories: ['gambling'],
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

    it('returns 409 if publisher already exists for user email', async () => {
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

      // Try creating second
      const res = await app.request('/v1/publishers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          domain: 'another.is',
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
            blockedCategories: ['gambling', 'sports'],
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contentPolicy.blockedCategories).toEqual(['gambling', 'sports']);
    });
  });
});
