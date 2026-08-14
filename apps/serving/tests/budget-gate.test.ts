import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';
import { setRedis } from '../src/lib/redis.js';
import {
  decrementBudget,
  getRemainingBudgets,
  getPaceState,
  incrementPaceSpent,
} from '../src/lib/analytics.js';
import { FLAT_CPM_ISK } from '@ada/shared';

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
  const requireInteger = (key: string, by: number) => {
    const stored = store.get(key);
    if (!Number.isInteger(by) || (stored !== undefined && !Number.isInteger(Number(stored)))) {
      throw new Error('ERR value is not an integer or out of range');
    }
  };
  const client = {
    mget: async (...keys: string[]) => {
      guard();
      return keys.map((k) => store.get(k) ?? null);
    },
    // DECRBY/INCRBY reject a non-integer argument AND a non-integer stored
    // value, exactly as real Redis does ("ERR value is not an integer or out of
    // range"). Without this the fake happily did JS float arithmetic, so the two
    // fraction tests below passed against the integer implementation they exist
    // to rule out — they asserted nothing at all.
    decrby: async (key: string, by: number) => {
      guard();
      requireInteger(key, by);
      const next = Number(store.get(key)) - by;
      store.set(key, next);
      return next;
    },
    incrby: async (key: string, by: number) => {
      guard();
      requireInteger(key, by);
      const next = Number(store.get(key) ?? 0) + by;
      store.set(key, next);
      return next;
    },
    // Real Redis returns INCRBYFLOAT's result as a string, and that is the
    // whole point of having it here: decrementBudget must convert it back, or
    // getRemainingBudgets compares a string to a number.
    incrbyfloat: async (key: string, by: number) => {
      guard();
      const next = Number(store.get(key) ?? 0) + by;
      // STORED as a string, which is what real Redis does — and what
      // @upstash/redis hands straight back from mget when the value does not
      // round-trip through JSON.parse. Storing a number here would hide the
      // coercion every reader has to do.
      store.set(key, String(next));
      return String(next);
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

  it('spends the budget in fractions of a króna, not whole ones', async () => {
    // The real decrementBudget, not a mock. One impression costs
    // FLAT_CPM_ISK / 1000 = 0,55; an integer counter cannot hold that, and
    // rounding it to 1 emptied the gate after 55% of the impressions the
    // budget had actually paid for.
    store.set('budget:cmp_1', 1000);

    for (let i = 0; i < 100; i++) {
      await decrementBudget('cmp_1', FLAT_CPM_ISK / 1000);
    }

    const remaining = await getRemainingBudgets(['cmp_1']);
    // 100 impressions of a 550 kr CPM is 55 kr, so 945 remain — not 900.
    expect(Math.round(remaining.cmp_1!)).toBe(945);
  });

  it('reads back a float counter as a number, so the gate still compares', async () => {
    // INCRBYFLOAT stores a string. If decrementBudget or getRemainingBudgets
    // leaves it one, `remaining > 0` is a string comparison and the fail-closed
    // gate stops meaning what it says.
    store.set('budget:cmp_1', 10);
    await decrementBudget('cmp_1', 0.55);

    const remaining = await getRemainingBudgets(['cmp_1']);
    expect(typeof remaining.cmp_1).toBe('number');
    expect(remaining.cmp_1).toBeCloseTo(9.45, 5);
  });

  it('hands the pace gate numbers even though Redis stores strings', async () => {
    // INCRBYFLOAT stores a decimal string. `ad.ts` compares spent < limit, which
    // coerces, so nothing is visibly broken — but the declared type says number
    // and the first arithmetic anyone does on a string spend concatenates.
    store.set('pace_limit:cmp_1', 500);
    await incrementPaceSpent('cmp_1', 0.55);
    await incrementPaceSpent('cmp_1', 0.55);

    const pace = await getPaceState(['cmp_1']);
    expect(typeof pace.cmp_1!.spent).toBe('number');
    expect(typeof pace.cmp_1!.limit).toBe('number');
    expect(pace.cmp_1!.spent).toBeCloseTo(1.1, 5);
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
