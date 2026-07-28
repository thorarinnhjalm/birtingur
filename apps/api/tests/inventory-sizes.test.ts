import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COLLECTIONS } from '@ada/shared/firestore';

let mockPublishers: any[] = [];
let mockSlots: any[] = [];
let mockStatsDocs: Record<string, any> = {};

vi.mock('../src/lib/firebase', () => {
  return {
    db: {
      collection: vi.fn((colName: string) => {
        return {
          where: vi.fn((prop: string, _op: string, val: unknown) => ({
            withConverter: vi.fn(() => ({
              get: vi.fn(async () => {
                if (colName === 'publishers') {
                  return { docs: mockPublishers.map((p) => ({ data: () => p })) };
                }
                if (colName === 'slots') {
                  const filtered = mockSlots.filter((s) => s[prop] === val);
                  return { docs: filtered.map((s) => ({ data: () => s })) };
                }
                return { docs: [] };
              }),
            })),
          })),
        };
      }),
      doc: vi.fn((path: string) => {
        return {
          get: vi.fn(async () => {
            return {
              exists: mockStatsDocs[path] !== undefined,
              data: () => mockStatsDocs[path],
            };
          }),
        };
      }),
    },
    auth: {},
    storage: {},
  };
});

// Fix 7 (adversarial review): Redis is unconfigured by default here (mirrors
// every other test in this file, which never touches Redis at all) so the
// pre-existing tests below keep exercising the live-compute path unchanged.
// Individual cache tests flip `mockConfigured`/seed `mockRedisGet` to
// exercise the cache-hit and cache-write paths explicitly.
let mockConfigured = false;
const mockRedisGet = vi.fn(async (_key: string) => null as unknown);
const mockRedisSet = vi.fn(async (_key: string, _val: unknown, _opts: unknown) => 'OK');

vi.mock('../src/lib/redis', () => ({
  isRedisConfigured: () => mockConfigured,
  getRedis: () => ({ get: mockRedisGet, set: mockRedisSet }),
}));

import { getCategorySizeForecast } from '../src/services/inventory';

function seed7DaysOfStats(publisherId: string, impressionsPerDay: number) {
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dk = d.toISOString().split('T')[0]!.replace(/-/g, '');
    mockStatsDocs[`${COLLECTIONS.stats}/publishers/${publisherId}/${dk}`] = {
      impressions: impressionsPerDay,
    };
  }
}

describe('getCategorySizeForecast', () => {
  beforeEach(() => {
    mockPublishers = [];
    mockSlots = [];
    mockStatsDocs = {};
    mockConfigured = false;
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    mockRedisGet.mockResolvedValue(null);
  });

  it('only counts ACTIVE slots on active publishers within the requested categories', async () => {
    mockPublishers.push({ id: 'pub_food', status: 'active', categories: ['matur'] });
    mockPublishers.push({ id: 'pub_travel', status: 'active', categories: ['ferdalog'] });
    seed7DaysOfStats('pub_food', 7000);
    seed7DaysOfStats('pub_travel', 7000);

    mockSlots.push({
      id: 'slot1',
      publisherId: 'pub_food',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
    });
    mockSlots.push({
      id: 'slot2',
      publisherId: 'pub_food',
      status: 'paused', // must be excluded
      sizes: [{ width: 728, height: 90 }],
    });
    mockSlots.push({
      id: 'slot3',
      publisherId: 'pub_travel', // wrong category, excluded entirely
      status: 'active',
      sizes: [{ width: 300, height: 600 }],
    });

    const result = await getCategorySizeForecast(['matur']);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ width: 300, height: 250, slotCount: 1 });
  });

  it('forecastShare sums to ~1 (0..1, two decimals) across the returned sizes', async () => {
    mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['matur'] });
    seed7DaysOfStats('pub_a', 14000);
    mockSlots.push({
      id: 's1',
      publisherId: 'pub_a',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
    });
    mockSlots.push({
      id: 's2',
      publisherId: 'pub_a',
      status: 'active',
      sizes: [{ width: 728, height: 90 }],
    });
    mockSlots.push({
      id: 's3',
      publisherId: 'pub_a',
      status: 'active',
      sizes: [{ width: 320, height: 100 }],
    });

    const result = await getCategorySizeForecast(['matur']);
    expect(result.length).toBeGreaterThan(0);
    const total = result.reduce((sum, r) => sum + (r.forecastShare ?? 0), 0);
    expect(total).toBeCloseTo(1, 1);
    for (const r of result) {
      expect(r.forecastShare).not.toBeNull();
      expect(r.forecastShare ?? 0).toBeGreaterThanOrEqual(0);
      expect(r.forecastShare ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('counts one slotCount per active slot declaring a size, even across multiple slots', async () => {
    mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['matur'] });
    seed7DaysOfStats('pub_a', 7000);
    mockSlots.push({
      id: 's1',
      publisherId: 'pub_a',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
    });
    mockSlots.push({
      id: 's2',
      publisherId: 'pub_a',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
    });

    const result = await getCategorySizeForecast(['matur']);
    expect(result).toHaveLength(1);
    expect(result[0]!.slotCount).toBe(2);
  });

  it('returns an empty array when no active publisher matches the requested categories', async () => {
    mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['ferdalog'] });
    seed7DaysOfStats('pub_a', 7000);
    mockSlots.push({
      id: 's1',
      publisherId: 'pub_a',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
    });

    const result = await getCategorySizeForecast(['matur']);
    expect(result).toEqual([]);
  });

  it('excludes a publisher with no active slots at all', async () => {
    mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['matur'] });
    seed7DaysOfStats('pub_a', 7000);
    mockSlots.push({
      id: 's1',
      publisherId: 'pub_a',
      status: 'paused',
      sizes: [{ width: 300, height: 250 }],
    });

    const result = await getCategorySizeForecast(['matur']);
    expect(result).toEqual([]);
  });

  // Blocker B1: a slot's `sizes` is a free-form field (seed.ts itself seeds
  // a 970x250 slot) — a non-IAB size reaching the wizard's "Stærðir" step
  // dead-ends it, since /generate/render only accepts IAB_STANDARD_SIZES.
  describe('B1: non-IAB slot sizes are filtered out (server truth for /generate/render)', () => {
    it('excludes a non-IAB size (970x250) entirely and renormalizes forecastShare over the IAB-only set', async () => {
      mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['matur'] });
      seed7DaysOfStats('pub_a', 14000);
      mockSlots.push({
        id: 's1',
        publisherId: 'pub_a',
        status: 'active',
        sizes: [{ width: 970, height: 250 }], // non-IAB — must be dropped
      });
      mockSlots.push({
        id: 's2',
        publisherId: 'pub_a',
        status: 'active',
        sizes: [{ width: 300, height: 250 }], // IAB — must be the only result
      });

      const result = await getCategorySizeForecast(['matur']);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ width: 300, height: 250, slotCount: 1 });
      // Renormalized: the only returned size carries the FULL share (~1),
      // not diluted by the excluded 970x250's contribution.
      expect(result[0]!.forecastShare).toBeCloseTo(1, 2);
    });

    it('excludes a non-IAB size declared alongside an IAB size on the SAME slot, without inflating the IAB size beyond its fair per-slot-size split', async () => {
      mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['matur'] });
      seed7DaysOfStats('pub_a', 14000);
      mockSlots.push({
        id: 's1',
        publisherId: 'pub_a',
        status: 'active',
        sizes: [
          { width: 970, height: 250 }, // non-IAB
          { width: 300, height: 250 }, // IAB
        ],
      });

      const result = await getCategorySizeForecast(['matur']);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ width: 300, height: 250, slotCount: 1 });
      // Still renormalizes to ~1 even though the slot "spent" half its
      // per-slot share on the excluded 970x250 — that share is just gone,
      // not folded onto the surviving IAB size.
      expect(result[0]!.forecastShare).toBeCloseTo(1, 2);
    });
  });

  // Finding #4: an empty 7-day forecast window (no impression history yet,
  // common at current scale) must not read as "every size gets ~0% of
  // traffic" — the API reports `forecastShare: null` so the UI can fall
  // back to showing only slot counts.
  describe('Finding #4: forecastShare is null (not 0) when the whole forecast window is empty', () => {
    it('returns forecastShare: null for every size when no publisher has any impression history', async () => {
      mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['matur'] });
      // No seed7DaysOfStats call — pubTotal stays 0 for every date key.
      mockSlots.push({
        id: 's1',
        publisherId: 'pub_a',
        status: 'active',
        sizes: [{ width: 300, height: 250 }],
      });

      const result = await getCategorySizeForecast(['matur']);
      expect(result).toHaveLength(1);
      expect(result[0]!.slotCount).toBe(1);
      expect(result[0]!.forecastShare).toBeNull();
    });
  });

  // Finding #7: a light Redis cache in front of the (expensive, N+1)
  // Firestore computation, keyed on the sorted category set, skipped
  // entirely when Redis isn't configured (matches lib/rate-limit.ts's
  // pattern for this exact reason).
  describe('Finding #7: Redis cache in front of the Firestore computation', () => {
    it('returns the cached value on a cache hit without touching Firestore', async () => {
      mockConfigured = true;
      const cached = [{ width: 300, height: 250, slotCount: 99, forecastShare: 0.5 }];
      mockRedisGet.mockResolvedValueOnce(cached);
      // No publishers/slots seeded at all — if this fell through to a live
      // compute it would return [], not the cached value.

      const result = await getCategorySizeForecast(['matur']);
      expect(result).toEqual(cached);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('computes live and writes through to the cache on a miss, keyed on the sorted category set', async () => {
      mockConfigured = true;
      mockRedisGet.mockResolvedValueOnce(null);
      mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['matur'] });
      seed7DaysOfStats('pub_a', 7000);
      mockSlots.push({
        id: 's1',
        publisherId: 'pub_a',
        status: 'active',
        sizes: [{ width: 300, height: 250 }],
      });

      // Category order in the call is reversed vs. the cache key's sorted
      // form — proves the key is normalized (sorted), not just joined as-is.
      const result = await getCategorySizeForecast(['matur']);
      expect(result).toHaveLength(1);
      expect(mockRedisSet).toHaveBeenCalledTimes(1);
      const [key, value, opts] = mockRedisSet.mock.calls[0]!;
      expect(key).toBe('sizes-forecast:matur');
      expect(value).toEqual(result);
      expect(opts).toEqual({ ex: 600 });
    });

    it('skips the cache entirely (no get/set calls) when Redis is unconfigured', async () => {
      mockConfigured = false;
      mockPublishers.push({ id: 'pub_a', status: 'active', categories: ['matur'] });
      seed7DaysOfStats('pub_a', 7000);
      mockSlots.push({
        id: 's1',
        publisherId: 'pub_a',
        status: 'active',
        sizes: [{ width: 300, height: 250 }],
      });

      const result = await getCategorySizeForecast(['matur']);
      expect(result).toHaveLength(1);
      expect(mockRedisGet).not.toHaveBeenCalled();
      expect(mockRedisSet).not.toHaveBeenCalled();
    });
  });
});
