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

describe('Support HTTP Routes', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    vi.resetAllMocks();
  });

  const mockUser = {
    uid: 'user-123',
    email: 'user@example.is',
    email_verified: true,
  };

  const mockAdminUser = {
    uid: 'admin-123',
    email: 'admin@example.is',
    admin: true,
    email_verified: true,
  };

  describe('POST /v1/support/public-messages', () => {
    it('creates a support message from public user without authentication', async () => {
      const res = await app.request('/v1/support/public-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderEmail: 'visitor@example.com',
          senderName: 'Gunnar',
          subject: 'Spurning um kerfið',
          body: 'Góðan daginn, ég hef áhuga á að vita meira.',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toMatch(/^sup_[a-f0-9]{24}$/);
      expect(body.senderEmail).toBe('visitor@example.com');
      expect(body.senderName).toBe('Gunnar');
      expect(body.role).toBe('unknown');
      expect(body.subject).toBe('Spurning um kerfið');
      expect(body.body).toBe('Góðan daginn, ég hef áhuga á að vita meira.');
      expect(body.status).toBe('unread');
    });

    it('returns 400 for invalid email', async () => {
      const res = await app.request('/v1/support/public-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderEmail: 'invalid-email',
          subject: 'Hjálp',
          body: 'Villa',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/support/messages (Authenticated)', () => {
    it('returns 401 if unauthenticated', async () => {
      const res = await app.request('/v1/support/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: 'Hjálp',
          body: 'Villa',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('creates support message if authenticated', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      const res = await app.request('/v1/support/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          subject: 'Stillingar veskis',
          body: 'Hvernig borga ég?',
          role: 'advertiser',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toMatch(/^sup_[a-f0-9]{24}$/);
      expect(body.senderEmail).toBe('user@example.is');
      expect(body.role).toBe('advertiser');
    });
  });

  describe('Admin actions on support messages', () => {
    it('returns 403 when non-admin lists support messages', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      const res = await app.request('/v1/support/messages', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      expect(res.status).toBe(403);
    });

    it('allows admin to list and update support messages', async () => {
      // 1. Create a public message
      const msgRes = await app.request('/v1/support/public-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderEmail: 'test-admin-view@example.com',
          subject: 'Galli í kerfi',
          body: 'Það virkar ekki að smella',
        }),
      });
      const msg = await msgRes.json();

      // 2. List messages as admin
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockAdminUser as any);
      const listRes = await app.request('/v1/support/messages', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer admin-token',
        },
      });
      expect(listRes.status).toBe(200);
      const list = await listRes.json();
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].senderEmail).toBe('test-admin-view@example.com');

      // 3. Mark as read
      const patchRes = await app.request(`/v1/support/messages/${msg.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify({
          status: 'read',
        }),
      });
      expect(patchRes.status).toBe(200);
    });
  });
});
