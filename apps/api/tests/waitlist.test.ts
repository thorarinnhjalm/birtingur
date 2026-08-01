import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/index';

interface StoredEntry {
  id: string;
  email: string;
  role: string;
  category?: string;
  createdAt: Date;
}

let waitlistStore: StoredEntry[] = [];

vi.mock('../src/services/mail', async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    sendWaitlistWelcomeEmail: vi.fn(async () => {}),
  };
});

vi.mock('../src/lib/firebase', () => {
  return {
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === 'admin-token') {
          return { uid: 'u-admin', email: 'admin@a.is', admin: true, email_verified: true };
        } else if (token === 'user-token') {
          return { uid: 'u-user', email: 'user@a.is', email_verified: true };
        }
        throw new Error('Invalid token');
      }),
    },
    db: {
      collection: vi.fn((colName: string) => {
        const createQuery = (filters: Array<{ prop: string; val: unknown }> = []) => {
          const queryObj: any = {
            where: vi.fn((p: string, _op: string, v: unknown) =>
              createQuery([...filters, { prop: p, val: v }]),
            ),
            limit: vi.fn(() => queryObj),
            get: vi.fn(async () => {
              let filtered: StoredEntry[] = colName === 'waitlist' ? [...waitlistStore] : [];
              for (const f of filters) {
                filtered = filtered.filter(
                  (item) => (item as unknown as Record<string, unknown>)[f.prop] === f.val,
                );
              }
              return {
                empty: filtered.length === 0,
                size: filtered.length,
                docs: filtered.map((item) => ({ id: item.id, data: () => item })),
              };
            }),
          };
          return queryObj;
        };
        return {
          ...createQuery(),
          doc: vi.fn((id: string) => ({
            withConverter: vi.fn(() => ({
              set: vi.fn(async (entry: StoredEntry) => {
                waitlistStore.push({ ...entry, id });
              }),
            })),
          })),
        };
      }),
    },
  };
});

import { sendWaitlistWelcomeEmail } from '../src/services/mail';

function post(body: unknown, ip: string) {
  return app.request('/v1/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/waitlist', () => {
  beforeEach(() => {
    waitlistStore = [];
    vi.mocked(sendWaitlistWelcomeEmail).mockClear();
  });

  it('rejects invalid input with 400', async () => {
    const res = await post({ email: 'not-an-email', role: 'advertiser' }, '10.0.0.1');
    expect(res.status).toBe(400);
  });

  it('creates an entry and awaits the welcome email', async () => {
    const res = await post({ email: 'new@example.com', role: 'publisher' }, '10.0.0.2');
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(waitlistStore).toHaveLength(1);
    expect(sendWaitlistWelcomeEmail).toHaveBeenCalledWith(
      'new@example.com',
      'publisher',
      undefined,
    );
  });

  it('returns idempotent success for an already-registered email', async () => {
    waitlistStore.push({
      id: 'wtl_existing',
      email: 'dup@example.com',
      role: 'advertiser',
      createdAt: new Date(),
    });
    const res = await post({ email: 'dup@example.com', role: 'advertiser' }, '10.0.0.3');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('wtl_existing');
    expect(waitlistStore).toHaveLength(1);
    expect(sendWaitlistWelcomeEmail).not.toHaveBeenCalled();
  });

  it('rate-limits the 6th submission from the same IP with 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await post({ email: `user${i}@example.com`, role: 'both' }, '10.0.0.4');
      expect(res.status).toBe(201);
    }
    const res = await post({ email: 'user5@example.com', role: 'both' }, '10.0.0.4');
    expect(res.status).toBe(429);
  });
});

describe('GET /v1/admin/waitlist/stats', () => {
  beforeEach(() => {
    waitlistStore = [
      { id: 'w1', email: 'a@x.is', role: 'advertiser', category: 'Food', createdAt: new Date() },
      { id: 'w2', email: 'b@x.is', role: 'publisher', category: 'food', createdAt: new Date() },
      { id: 'w3', email: 'c@x.is', role: 'both', createdAt: new Date() },
    ];
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.request('/v1/admin/waitlist/stats');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users with 403', async () => {
    const res = await app.request('/v1/admin/waitlist/stats', {
      headers: { Authorization: 'Bearer user-token' },
    });
    expect(res.status).toBe(403);
  });

  it('aggregates roles and case-folded categories for admins', async () => {
    const res = await app.request('/v1/admin/waitlist/stats', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.roles).toEqual({ advertisers: 1, publishers: 1, both: 1 });
    expect(body.categories).toEqual({ food: 2 });
  });

  it('is no longer reachable at the old public path', async () => {
    const res = await app.request('/v1/waitlist/stats');
    expect(res.status).toBe(404);
  });
});
