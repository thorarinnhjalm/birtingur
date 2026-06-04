import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireAuth } from '../src/lib/auth.js';
import { issueApiKey, verifyApiKey, revokeApiKey, listApiKeys } from '../src/services/api-keys.js';
import { apiKeysRouter } from '../src/routes/api-keys.js';
import { db } from '../src/lib/firebase.js';

vi.mock('../src/lib/firebase.js', () => {
  const store: Record<string, any> = {};
  return {
    db: {
      collection: (col: string) => ({
        doc: (id: string) => ({
          set: async (val: any) => {
            store[id] = val;
            return {};
          },
          get: async () => ({
            exists: !!store[id],
            data: () => store[id],
          }),
          update: async (val: any) => {
            if (store[id]) {
              store[id] = { ...store[id], ...val };
            }
            return {};
          },
        }),
        where: (field: string, op: string, value: any) => ({
          get: async () => {
            const docs = Object.values(store)
              .filter((item) => item && item[field] === value)
              .map((item) => ({
                exists: true,
                data: () => item,
              }));
            return { docs };
          },
        }),
      }),
    },
    auth: {
      verifyIdToken: vi.fn(),
    },
  };
});

describe('API Key Authentication & Management', () => {
  let app: Hono<any>;

  beforeEach(() => {
    vi.resetAllMocks();

    app = new Hono();
    app.route('/v1/api-keys', apiKeysRouter);

    // Protected test route using requireAuth
    app.get('/test-protected', requireAuth, (c) => {
      const user = c.get('user');
      return c.json({ ok: true, user });
    });
  });

  it('can issue a valid API key and verify it', async () => {
    const email = 'user@example.is';
    const { key, id } = await issueApiKey(email, 'both');

    expect(key).toContain(id);
    expect(key.startsWith('ak_')).toBe(true);

    const record = await verifyApiKey(key);
    expect(record).not.toBeNull();
    expect(record?.ownerEmail).toBe(email);
    expect(record?.revoked).toBe(false);
  });

  it('fails verification for revoked API keys', async () => {
    const email = 'user@example.is';
    const { key, id } = await issueApiKey(email, 'both');

    await revokeApiKey(id);

    const record = await verifyApiKey(key);
    expect(record).toBeNull();
  });

  it('allows access to protected routes with valid API key bearer token', async () => {
    const email = 'user@example.is';
    const { key, id } = await issueApiKey(email, 'both');

    const res = await app.request('/test-protected', {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.uid).toBe(`apikey:${id}`);
    expect(body.user.email).toBe(email);
  });

  it('denies access with invalid or modified API key', async () => {
    const res = await app.request('/test-protected', {
      headers: {
        Authorization: 'Bearer ak_invalidkeyhere12345',
      },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('denies access if API key format does not match ak_ pattern', async () => {
    const res = await app.request('/test-protected', {
      headers: {
        Authorization: 'Bearer invalid_prefix_key_12345',
      },
    });
    expect(res.status).toBe(401);
  });

  it('can list API keys for a user', async () => {
    const email = 'list-user@example.is';
    await issueApiKey(email, 'advertiser');
    await issueApiKey(email, 'publisher');

    const keys = await listApiKeys(email);
    expect(keys.length).toBe(2);
    expect(keys.find((k) => k.scope === 'advertiser')).toBeDefined();
    expect(keys.find((k) => k.scope === 'publisher')).toBeDefined();
    expect(keys.every((k) => (k as any).hash === undefined)).toBe(true);
  });
});

