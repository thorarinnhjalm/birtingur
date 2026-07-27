import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/index';

// The Hono admin routes for payouts/generate, payouts/:id/mark-completed, and
// cache/refresh reach the same money-flow / cache-write functions that the
// cron entrypoints protect with previewCronBlockReason() (see
// lib/preview-guard.ts) — without the same guard here, a Vercel preview
// deploy (which shares the production Firestore/Redis by default) could
// mutate real payouts or push cache writes through the admin API even though
// the cron endpoints themselves refuse to run. This asserts all three routes
// 403 with the same `preview_blocked` shape when VERCEL_ENV=preview and
// ALLOW_PREVIEW_CRONS is not set.

vi.mock('../src/lib/firebase', () => ({
  auth: {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'admin-token') {
        return { uid: 'u-admin', email: 'admin@adplatform.is', admin: true, email_verified: true };
      }
      throw new Error('Invalid token');
    }),
  },
  // The preview guard is checked first in every route under test, before any
  // db access for THIS request happens, so this mock never needs to serve
  // real data — it just needs `collection()` to exist, since some modules
  // (e.g. services/support.ts) call db.collection(...) once at import time.
  db: {
    collection: vi.fn(() => ({})),
  },
  storage: {},
}));

describe('Admin routes preview guard', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.VERCEL_ENV = process.env.VERCEL_ENV;
    savedEnv.ALLOW_PREVIEW_CRONS = process.env.ALLOW_PREVIEW_CRONS;
    process.env.VERCEL_ENV = 'preview';
    delete process.env.ALLOW_PREVIEW_CRONS;
  });

  afterEach(() => {
    if (savedEnv.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
    if (savedEnv.ALLOW_PREVIEW_CRONS === undefined) delete process.env.ALLOW_PREVIEW_CRONS;
    else process.env.ALLOW_PREVIEW_CRONS = savedEnv.ALLOW_PREVIEW_CRONS;
  });

  it('blocks POST /v1/admin/cache/refresh on a preview deploy without the opt-in flag', async () => {
    const res = await app.request('/v1/admin/cache/refresh', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('preview_blocked');
    expect(body.reason).toMatch(/preview/i);
  });

  it('blocks POST /v1/admin/payouts/generate on a preview deploy without the opt-in flag', async () => {
    const res = await app.request('/v1/admin/payouts/generate', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodStart: '2026-01-01', periodEnd: '2026-01-31' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('preview_blocked');
  });

  it('blocks POST /v1/admin/payouts/:id/mark-completed on a preview deploy without the opt-in flag', async () => {
    const res = await app.request('/v1/admin/payouts/payout_1/mark-completed', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankReference: 'ref-1' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('preview_blocked');
  });
});
