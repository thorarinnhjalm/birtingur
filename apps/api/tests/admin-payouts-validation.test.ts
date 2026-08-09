import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/index';

// MINOR-8 (adversarial review): POST /v1/admin/payouts/generate used to pass
// an inverted date range (end <= start) straight through to
// generateMonthlyPayouts, which throws a raw ZodError mid-loop (PayoutSchema's
// periodEnd > periodStart refinement) only AFTER earlier publishers in that
// iteration already had their payout docs created — a partially applied run.
// The route now rejects the inverted range up front with a clean 400, before
// touching Firestore at all, so this mock never needs to serve payout data.
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
    collection: vi.fn(() => ({})),
  },
  storage: {},
}));

describe('POST /v1/admin/payouts/generate — date range validation', () => {
  const savedVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    // Explicitly non-preview so previewCronBlockReason() never short-circuits
    // before the validation under test runs.
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedVercelEnv;
  });

  it('rejects an inverted range (periodEnd <= periodStart) with 400 instead of throwing mid-run', async () => {
    const res = await app.request('/v1/admin/payouts/generate', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodStart: '2026-08-31', periodEnd: '2026-08-01' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/periodEnd must be after periodStart/i);
  });

  it('rejects an equal range (periodEnd === periodStart) with 400', async () => {
    const res = await app.request('/v1/admin/payouts/generate', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodStart: '2026-08-01', periodEnd: '2026-08-01' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/periodEnd must be after periodStart/i);
  });
});
