import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';
import { setRedis } from '../src/lib/redis.js';

// The fail-closed budget gate, tested WITHOUT mocking analytics. Every other
// serving suite replaces getRemainingBudgets with a fake, so the one property
// that protects revenue — a missing or expired `budget:{id}` key means DO NOT
// SERVE, never "serve free" — was implemented (commit d76b72b) but pinned by
// nothing. Here the real getRemainingBudgets/logEvent/decrementBudget run
// against an in-memory Redis stand-in injected through the setRedis() seam,
// so a refactor that flips the null-means-zero default to null-means-infinity
// fails this file.
//
// (Blueprint subsystem 1; gap item 2 in specs/2026-08-12-blueprint.md.)

const mockSlot: SlotCacheEntry = {
  slotId: 'slot_a',
  publisherId: 'pub_a',
  sizes: [{ width: 728, height: 90 }],
  pricing: { mode: 'cpm', cpmIsk: 1000 },
  activeCreatives: [
    {
      creativeId: 'cre_a',
      campaignId: 'cmp_a',
      imageUrl: 'https://example/a.png',
      clickUrl: 'https://example/x',
      width: 728,
      height: 90,
      weight: 1,
      frequencyCapPerDay: 3,
      budgetExhausted: false,
      validFrom: Date.now() - 1000,
      validTo: Date.now() + 60000,
      priority: 'cpm',
    },
  ],
  blockedCategories: [],
  refreshedAt: Date.now(),
};

vi.mock('../src/lib/cache', () => ({
  getSlotCache: vi.fn(async (id: string) => (id === 'slot_a' ? mockSlot : null)),
  pushSlotCache: vi.fn(),
  invalidateSlot: vi.fn(),
}));

vi.mock('../src/lib/visitor', () => ({
  getVisitorToken: vi.fn(() => 'tok123'),
  getVisitorImpressionsToday: vi.fn(async () => ({})),
  recordVisitorImpression: vi.fn(),
}));

// NOTE: deliberately NO vi.mock('../src/lib/analytics') here.

/** Key-value store behind the fake client; budget keys are seeded per test. */
let store: Map<string, number | string>;
/** When true, every Redis call throws — the "Upstash is down" scenario. */
let redisDown = false;

function fakeRedis() {
  const guard = () => {
    if (redisDown) throw new Error('redis unavailable');
  };
  const client = {
    mget: async (...keys: string[]) => {
      guard();
      return keys.map((k) => store.get(k) ?? null);
    },
    decrby: async (key: string, by: number) => {
      guard();
      const next = Number(store.get(key) ?? 0) - by;
      store.set(key, next);
      return next;
    },
    incrby: async (key: string, by: number) => {
      guard();
      const next = Number(store.get(key) ?? 0) + by;
      store.set(key, next);
      return next;
    },
    expire: async () => {
      guard();
      return 1;
    },
    pipeline: () => {
      const ops: Array<() => void> = [];
      const p = {
        lpush: (key: string, val: string) => {
          ops.push(() => {
            const list = (store.get(`list:${key}`) as unknown as string[]) ?? [];
            list.unshift(val);
            store.set(`list:${key}`, list as unknown as string);
          });
          return p;
        },
        incr: (key: string) => {
          ops.push(() => store.set(key, Number(store.get(key) ?? 0) + 1));
          return p;
        },
        expire: () => p,
        exec: async () => {
          guard();
          for (const op of ops) op();
        },
      };
      return p;
    },
  };
  return client as unknown as Parameters<typeof setRedis>[0];
}

import app from '../src/index';

describe('fail-closed budget gate (real getRemainingBudgets)', () => {
  beforeEach(() => {
    store = new Map();
    redisDown = false;
    setRedis(fakeRedis());
  });

  it('serves the ad when the budget key exists with money left', async () => {
    store.set('budget:cmp_a', 5000);

    const res = await app.request('/v1/ad?slot=slot_a&consent=full');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_a');
  });

  it('does NOT serve when the budget key is missing — fail closed, never free', async () => {
    // No budget:cmp_a in the store: the counter was never seeded, or its 1h
    // TTL expired between cache refreshes. Serving anyway would be unbilled
    // delivery; the design reads absence as zero and falls back.
    const res = await app.request('/v1/ad?slot=slot_a&consent=full');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_birtingur');
  });

  it('does NOT serve when the budget key exists but is exhausted (0 or negative)', async () => {
    store.set('budget:cmp_a', 0);

    const res = await app.request('/v1/ad?slot=slot_a&consent=full');

    const body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_birtingur');
  });

  it('returns 500 (no ad at all) when Redis itself is unreachable', async () => {
    store.set('budget:cmp_a', 5000);
    redisDown = true;

    const res = await app.request('/v1/ad?slot=slot_a&consent=full');

    // Also fail-closed: with Redis gone there is no way to know any budget,
    // so the handler throws rather than serving unmetered ads.
    expect(res.status).toBe(500);
  });
});
