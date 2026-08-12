import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Pins the test-environment isolation contract in src/lib/env.ts: a test run
// must see exactly what CI sees — the emulator and no live-service
// credentials — no matter what the developer's shell or root .env.local
// carries. Before this existed, every local `pnpm test:api` run inherited
// real Upstash credentials from .env.local and wrote `slot:{id}` keys into
// PRODUCTION Redis, while tests/slot-delivery failed locally and passed in
// CI (see docs/superpowers/specs/2026-08-12-blueprint.md, subsystem 9).
//
// env.ts runs its logic at import time, so each case resets the module
// registry, plants hostile env, and re-imports.

const LIVE_SERVICE_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'RESEND_API_KEY',
  'TEYA_API_KEY',
  'TEYA_WEBHOOK_SECRET',
  'GEMINI_API_KEY',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PROJECT_ID',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(LIVE_SERVICE_KEYS.map((k) => [k, process.env[k]]));
  vi.resetModules();
});

afterEach(() => {
  for (const k of LIVE_SERVICE_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('test-environment isolation (src/lib/env.ts)', () => {
  it('strips live-service credentials planted in the environment', async () => {
    // Simulate a developer shell that exported real credentials (or a leaky
    // .env.local that something else already loaded).
    process.env.UPSTASH_REDIS_REST_URL = 'https://real-prod-instance.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'real-token';
    process.env.KV_REST_API_URL = 'https://real-prod-instance.upstash.io';
    process.env.KV_REST_API_TOKEN = 'real-token';
    process.env.RESEND_API_KEY = 're_real';
    process.env.TEYA_API_KEY = 'teya_real';
    process.env.GEMINI_API_KEY = 'gm_real';
    process.env.FIREBASE_PRIVATE_KEY = 'real-key';
    process.env.FIREBASE_CLIENT_EMAIL = 'svc@real.iam';
    process.env.FIREBASE_PROJECT_ID = 'ada-prod';

    await import('../src/lib/env');

    expect(process.env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(process.env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
    expect(process.env.KV_REST_API_URL).toBeUndefined();
    expect(process.env.KV_REST_API_TOKEN).toBeUndefined();
    expect(process.env.RESEND_API_KEY).toBeUndefined();
    expect(process.env.TEYA_API_KEY).toBeUndefined();
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
    expect(process.env.FIREBASE_PRIVATE_KEY).toBeUndefined();
    expect(process.env.FIREBASE_CLIENT_EMAIL).toBeUndefined();
    expect(process.env.FIREBASE_PROJECT_ID).toBeUndefined();
  });

  it('leaves isRedisConfigured() false after the strip', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://real-prod-instance.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'real-token';

    await import('../src/lib/env');
    const { isRedisConfigured } = await import('../src/lib/redis');

    // This is the gate slot-delivery, rate-limiting and the caches all read;
    // false means no code path can construct a client pointed at prod.
    expect(isRedisConfigured()).toBe(false);
  });

  it('forces the emulator hosts', async () => {
    await import('../src/lib/env');

    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8080');
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099');
  });
});
