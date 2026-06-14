import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../src/lib/auth';
import { auth } from '../src/lib/firebase';

vi.mock('../src/lib/firebase', () => {
  return {
    auth: {
      verifyIdToken: vi.fn(),
    },
    db: {},
    storage: {},
  };
});

describe('Authentication Middleware', () => {
  let app: Hono<any>;

  beforeEach(() => {
    vi.resetAllMocks();

    app = new Hono();

    // Protected route
    app.get('/protected', requireAuth, (c) => {
      const user = c.get('user');
      return c.json({ ok: true, user });
    });

    // Admin-only route
    app.get('/admin', requireAuth, requireAdmin, (c) => {
      return c.json({ ok: true });
    });
  });

  describe('requireAuth', () => {
    it('returns 401 if Authorization header is missing', async () => {
      const res = await app.request('/protected');
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body).toEqual({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    });

    it('returns 401 if Authorization header does not use Bearer scheme', async () => {
      const res = await app.request('/protected', {
        headers: {
          Authorization: 'Basic abc123def',
        },
      });
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 if token verification fails', async () => {
      vi.mocked(auth.verifyIdToken).mockRejectedValue(new Error('Token expired'));

      const res = await app.request('/protected', {
        headers: {
          Authorization: 'Bearer expired-token',
        },
      });
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid or expired token');
    });

    it('authenticates successfully with valid token and attaches user to context', async () => {
      const mockDecodedToken = {
        uid: 'user-123',
        email: 'user@example.is',
        admin: false,
        email_verified: true,
      };

      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockDecodedToken as any);

      const res = await app.request('/protected', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.user).toEqual({
        uid: 'user-123',
        email: 'user@example.is',
        admin: false,
        scope: 'both',
      });
      expect(auth.verifyIdToken).toHaveBeenCalledWith('valid-token');
    });

    it('accepts demo-mock-token when DEMO_AUTH=true', async () => {
      const original = process.env.DEMO_AUTH;
      process.env.DEMO_AUTH = 'true';
      try {
        const res = await app.request('/protected', {
          headers: {
            Authorization: 'Bearer demo-mock-token',
          },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user.email).toBe('demoa@birtingur.is');
      } finally {
        process.env.DEMO_AUTH = original;
      }
    });

    it('rejects demo-mock-token when DEMO_AUTH is not set', async () => {
      const original = process.env.DEMO_AUTH;
      delete process.env.DEMO_AUTH;
      try {
        const res = await app.request('/protected', {
          headers: {
            Authorization: 'Bearer demo-mock-token',
          },
        });
        expect(res.status).toBe(401);
      } finally {
        process.env.DEMO_AUTH = original;
      }
    });
  });

  describe('requireAdmin', () => {
    it('returns 403 if authenticated user is not an admin', async () => {
      const mockDecodedToken = {
        uid: 'user-123',
        email: 'user@example.is',
        admin: false,
        email_verified: true,
      };
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockDecodedToken as any);

      const res = await app.request('/admin', {
        headers: {
          Authorization: 'Bearer regular-token',
        },
      });
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body).toEqual({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    });

    it('allows access if authenticated user is an admin', async () => {
      const mockDecodedToken = {
        uid: 'admin-123',
        email: 'admin@example.is',
        admin: true,
        email_verified: true,
      };
      vi.mocked(auth.verifyIdToken).mockResolvedValue(mockDecodedToken as any);

      const res = await app.request('/admin', {
        headers: {
          Authorization: 'Bearer admin-token',
        },
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });
});
