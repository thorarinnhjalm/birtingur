import { vi, describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { createNotification } from '../src/services/notifications';

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

describe('Notifications HTTP Routes', () => {
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

  describe('GET /v1/notifications', () => {
    it('returns 401 if unauthenticated', async () => {
      const res = await app.request('/v1/notifications?role=advertiser', {
        method: 'GET',
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 if role parameter is missing or invalid', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const res = await app.request('/v1/notifications', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });
      expect(res.status).toBe(400);

      const res2 = await app.request('/v1/notifications?role=invalid', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });
      expect(res2.status).toBe(400);
    });

    it('returns 403 if non-admin requests admin notifications', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);
      const res = await app.request('/v1/notifications?role=admin', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });
      expect(res.status).toBe(403);
    });

    it('returns notifications for advertiser', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      // Create a test notification in Firestore
      await createNotification({
        userEmail: 'user@example.is',
        role: 'advertiser',
        type: 'success',
        title: 'Innborgun móttekin',
        message: 'Greiðsla upp á 10.000 kr. var staðfest.',
      });

      const res = await app.request('/v1/notifications?role=advertiser', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe('Innborgun móttekin');
      expect(list[0].read).toBe(false);
    });

    it('allows admin to fetch admin notifications', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockAdminUser as any);

      await createNotification({
        userEmail: 'admin',
        role: 'admin',
        type: 'warning',
        title: 'Ný auglýsing í yfirferð',
        message: 'Nýtt efni bíður samþykkis.',
      });

      const res = await app.request('/v1/notifications?role=admin', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer admin-token',
        },
      });

      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe('Ný auglýsing í yfirferð');
    });
  });

  describe('PATCH /v1/notifications/:id/read', () => {
    it('marks a notification as read', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      const notif = await createNotification({
        userEmail: 'user@example.is',
        role: 'advertiser',
        type: 'info',
        title: 'Halló',
        message: 'Tilkynning',
      });

      const res = await app.request(`/v1/notifications/${notif.id}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });

      expect(res.status).toBe(200);

      // Verify in db/list
      const listRes = await app.request('/v1/notifications?role=advertiser', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });
      const list = await listRes.json();
      expect(list[0].read).toBe(true);
    });
  });

  describe('POST /v1/notifications/read-all', () => {
    it('marks all notifications for a role as read', async () => {
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockUser as any);

      await createNotification({
        userEmail: 'user@example.is',
        role: 'advertiser',
        type: 'info',
        title: 'Tilkynning 1',
        message: 'Skilaboð 1',
      });

      await createNotification({
        userEmail: 'user@example.is',
        role: 'advertiser',
        type: 'info',
        title: 'Tilkynning 2',
        message: 'Skilaboð 2',
      });

      const res = await app.request('/v1/notifications/read-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ role: 'advertiser' }),
      });

      expect(res.status).toBe(200);

      // Verify list has zero unread
      const listRes = await app.request('/v1/notifications?role=advertiser', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });
      const list = await listRes.json();
      expect(list.filter((n: any) => !n.read)).toHaveLength(0);
    });
  });
});
