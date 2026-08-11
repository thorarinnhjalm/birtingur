import { describe, it, expect, vi, beforeEach } from 'vitest';

// The diagnostics route reports on infrastructure, which makes it the most
// likely place to over-share. Two things it used to hand back that it
// shouldn't: raw stack traces from every failed probe, and the character
// length of CRON_SECRET and FIREBASE_PRIVATE_KEY. Admin-only is not a reason
// to ship either — the boolean already says everything a reader needs.

vi.mock('../src/lib/firebase', () => ({
  auth: {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'admin-token') {
        return { uid: 'u-admin', email: 'admin@birtingur.app', admin: true, email_verified: true };
      }
      throw new Error('Invalid token');
    }),
  },
  db: {
    // Every probe in the route fails, which is exactly the shape that used
    // to produce stack traces in the response body.
    listCollections: vi.fn(async () => {
      throw new Error('firestore exploded');
    }),
    collection: vi.fn(() => ({
      get: async () => {
        throw new Error('slots query exploded');
      },
    })),
    doc: vi.fn(() => ({
      get: async () => {
        throw new Error('doc exploded');
      },
    })),
  },
  storage: {},
}));

import { app } from '../src/index';

async function fetchDiagnostics() {
  const res = await app.request('/v1/admin/diagnostics', {
    headers: { Authorization: 'Bearer admin-token' },
  });
  return { res, body: (await res.json()) as Record<string, any> };
}

describe('GET /v1/admin/diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'a-secret-of-known-length';
    process.env.FIREBASE_PRIVATE_KEY = 'another-secret-value';
  });

  it('never returns a stack trace, even when every probe fails', async () => {
    const { res, body } = await fetchDiagnostics();

    expect(res.status).toBe(200);
    expect(body.firestore.status).toBe('error');
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(JSON.stringify(body)).not.toMatch(/\bat \w+ \(/); // no "at fn (file:line)"
  });

  it('reports secret presence without reporting length or value', async () => {
    const { body } = await fetchDiagnostics();

    expect(body.env.CRON_SECRET_EXISTS).toBe(true);
    expect(body.env.FIREBASE_PRIVATE_KEY_EXISTS).toBe(true);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('a-secret-of-known-length');
    expect(serialized).not.toContain('another-secret-value');
    expect(Object.keys(body.env).filter((k) => k.endsWith('_LENGTH'))).toEqual([]);
  });

  // A per-publisher probe hardcoded to one site used to live here. It said
  // nothing about anyone else, so it could look healthy while the pipeline
  // was down for every other publisher.
  it('no longer probes one hardcoded publisher', async () => {
    const { body } = await fetchDiagnostics();

    expect(body.firestoreStats).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('pub_95af8e6a');
  });

  it('still refuses a non-admin caller', async () => {
    const res = await app.request('/v1/admin/diagnostics', {
      headers: { Authorization: 'Bearer nope' },
    });

    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThan(404);
  });
});
