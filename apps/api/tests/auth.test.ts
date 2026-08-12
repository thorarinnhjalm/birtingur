import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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

vi.mock('../src/services/api-keys', () => ({
  verifyApiKey: vi.fn(),
}));

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

    it('rejects demo-mock-token (removed feature)', async () => {
      const res = await app.request('/protected', {
        headers: {
          Authorization: 'Bearer demo-mock-token',
        },
      });
      expect(res.status).toBe(401);
    });

    it('rejects a token whose email is present but not verified', async () => {
      // Firebase email/password sign-up is reachable with the public web API
      // key, so an unverified token could claim anyone's email — and the whole
      // authorization model (admin grant, ownerEmail ownership) keys on email.
      vi.mocked(auth.verifyIdToken).mockResolvedValue({
        uid: 'user-123',
        email: 'victim@example.is',
        email_verified: false,
      } as any);

      const res = await app.request('/protected', {
        headers: { Authorization: 'Bearer unverified-token' },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.message).toBe('Email address must be verified');
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

  // The tests above exercise requireAdmin with the flag already decided (the
  // custom claim). These pin the RESOLUTION in requireAuth itself — the exact
  // spot where, until 2026-08-09, a hardcoded domain-suffix rule granted full
  // admin (payouts included) to any verified address on `adplatform.is`, a
  // domain nobody had registered. Admin must come from ADMIN_EMAILS or a
  // server-set custom claim, and from nothing else.
  describe('admin resolution (ADMIN_EMAILS allowlist)', () => {
    const originalAdminEmails = process.env.ADMIN_EMAILS;

    afterEach(() => {
      if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = originalAdminEmails;
    });

    function tokenFor(email: string) {
      vi.mocked(auth.verifyIdToken).mockResolvedValue({
        uid: 'user-1',
        email,
        email_verified: true,
      } as any);
    }

    it('grants admin to an email on the ADMIN_EMAILS list', async () => {
      process.env.ADMIN_EMAILS = 'owner@birtingur.app, backup@birtingur.app';
      tokenFor('owner@birtingur.app');

      const res = await app.request('/admin', {
        headers: { Authorization: 'Bearer t' },
      });

      expect(res.status).toBe(200);
    });

    it('grants admin case-insensitively', async () => {
      process.env.ADMIN_EMAILS = 'owner@birtingur.app';
      tokenFor('Owner@Birtingur.app');

      const res = await app.request('/admin', {
        headers: { Authorization: 'Bearer t' },
      });

      expect(res.status).toBe(200);
    });

    it('does NOT grant admin to an unlisted address on the same domain as an admin', async () => {
      // The regression this whole block exists for: sharing a domain with an
      // admin must mean nothing. Only exact listed addresses are admins.
      process.env.ADMIN_EMAILS = 'owner@birtingur.app';
      tokenFor('someone-else@birtingur.app');

      const res = await app.request('/admin', {
        headers: { Authorization: 'Bearer t' },
      });

      expect(res.status).toBe(403);
    });

    it('grants admin to nobody when ADMIN_EMAILS is unset', async () => {
      delete process.env.ADMIN_EMAILS;
      tokenFor('owner@birtingur.app');

      const res = await app.request('/admin', {
        headers: { Authorization: 'Bearer t' },
      });

      expect(res.status).toBe(403);
    });

    it('never grants admin to an ak_ API key, whatever email it carries', async () => {
      // verifyApiKey is not mocked in this file, so reaching for a real key
      // record would throw — mock the module boundary the same way firebase is.
      process.env.ADMIN_EMAILS = 'owner@birtingur.app';
      const { verifyApiKey } = await import('../src/services/api-keys');
      vi.mocked(verifyApiKey).mockResolvedValue({
        id: 'key_1',
        ownerEmail: 'owner@birtingur.app',
        scope: 'both',
      } as any);

      const res = await app.request('/admin', {
        headers: { Authorization: 'Bearer ak_anything' },
      });

      expect(res.status).toBe(403);
    });
  });

  // The demo-mock-token backdoor was removed outright (21b1b29 / 0c0c70a):
  // auth accepts exactly two shapes, a Firebase ID token and an ak_ key.
  // This scans the auth source for any literal token comparison so a
  // reintroduced dev shortcut fails a test by construction, not by luck.
  describe('no bypass token exists in the auth source', () => {
    it('lib/auth.ts compares the bearer token against no hardcoded literal', async () => {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { resolve, dirname } = await import('node:path');
      const src = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/auth.ts'),
        'utf8',
      );

      // The only prefix check allowed is the ak_ namespace dispatch.
      const tokenComparisons = [
        ...src.matchAll(/token\s*(?:===|==|\.startsWith\()\s*['"`]([^'"`]*)/g),
      ]
        .map((m) => m[1])
        .filter((literal) => literal !== 'ak_');

      expect(tokenComparisons).toEqual([]);
      expect(src).not.toContain('demo-mock-token');
      expect(src).not.toContain('DEMO_AUTH');
    });
  });
});
