import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define a unified mock data holder that Vitest will hoist since its name starts with "mock"
interface MockState {
  slot: any;
  publisher: any;
  slots: any[];
  publishers: any[];
  campaigns: any[];
  creatives: any[];
}

const mockState: MockState = {
  slot: null,
  publisher: null,
  slots: [],
  publishers: [],
  campaigns: [],
  creatives: [],
};

vi.mock('../src/lib/firebase', () => ({
  db: {
    collection: vi.fn((colName: string) => {
      return {
        doc: vi.fn((id: string) => ({
          id,
          withConverter: vi.fn(() => ({
            id,
            get: vi.fn(async () => {
              if (colName === 'slots') {
                const found = mockState.slots.find((s) => s.id === id) || mockState.slot;
                return {
                  exists: found !== null,
                  data: () => found,
                };
              }
              if (colName === 'publishers') {
                const found = mockState.publishers.find((p) => p.id === id) || mockState.publisher;
                return {
                  exists: found !== null,
                  data: () => found,
                };
              }
              if (colName === 'campaigns') {
                const found = mockState.campaigns.find((c) => c.id === id);
                return {
                  exists: found !== undefined,
                  data: () => found,
                };
              }
              return { exists: false, data: () => null };
            }),
          })),
        })),
        where: vi.fn(() => {
          let builder: any;
          builder = {
            where: vi.fn(() => builder),
            withConverter: vi.fn(() => ({
              get: vi.fn(async () => {
                if (colName === 'campaigns') {
                  return {
                    docs: mockState.campaigns.map((c) => ({
                      id: c.id,
                      data: () => c,
                    })),
                  };
                }
                if (colName === 'publishers') {
                  return {
                    docs: mockState.publishers.map((p) => ({
                      id: p.id,
                      data: () => p,
                    })),
                  };
                }
                if (colName === 'slots') {
                  return {
                    docs: mockState.slots.map((s) => ({
                      id: s.id,
                      data: () => s,
                    })),
                  };
                }
                return { docs: [] };
              }),
            })),
          };
          return builder;
        }),
      };
    }),
    getAll: vi.fn(async (...refs: Array<{ id: string }>) => {
      return refs.map((ref) => {
        const creative = mockState.creatives.find((c) => c.id === ref.id);
        if (creative) {
          return {
            id: ref.id,
            exists: true,
            data: () => creative,
          };
        }
        // If not in creatives list, assume it is an advertiser ref and return active status
        return {
          id: ref.id,
          exists: true,
          data: () => ({ status: 'active' }),
        };
      });
    }),
  },
  auth: {},
  storage: {},
}));

const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
// Direct (non-pipelined) hgetall. push-cache must never use this: one round trip
// per creative against Upstash's REST API is the shape that took cron-aggregate
// down, and this refresh runs over every slot in the network.
const mockDirectHgetall = vi.fn();

let mockCtrHashes: Record<string, Record<string, unknown> | null> = {};
let mockCtrReadError: Error | null = null;
let mockPipelineCalls = 0;

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    set: mockRedisSet,
    del: mockRedisDel,
    hgetall: mockDirectHgetall,
    pipeline: () => {
      mockPipelineCalls += 1;
      const keys: string[] = [];
      const p: any = {
        hgetall: (k: string) => {
          keys.push(k);
          return p;
        },
        exec: async () => {
          if (mockCtrReadError) {
            const err = mockCtrReadError;
            mockCtrReadError = null;
            throw err;
          }
          return keys.map((k) => mockCtrHashes[k] ?? null);
        },
      };
      return p;
    },
  }),
}));

import { ctrCounterKey, MAX_CACHED_VARIANTS_PER_CAMPAIGN } from '@ada/shared';
import { pushSlotCache, pushCacheForCampaign } from '../src/lib/push-cache';

describe('pushSlotCache helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.slot = null;
    mockState.publisher = null;
    mockState.slots = [];
    mockState.publishers = [];
    mockState.campaigns = [];
    mockState.creatives = [];
    mockCtrHashes = {};
    mockCtrReadError = null;
    mockPipelineCalls = 0;
  });

  it('deletes cache entry when slot does not exist', async () => {
    await pushSlotCache('slot_missing');
    expect(mockRedisDel).toHaveBeenCalledWith('slot:slot_missing');
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it('deletes cache entry when publisher does not exist', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_missing',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };

    await pushSlotCache('slot_123');
    expect(mockRedisDel).toHaveBeenCalledWith('slot:slot_123');
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it('pushes empty activeCreatives when slot status is paused', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'paused',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    await pushSlotCache('slot_123');
    expect(mockRedisSet).toHaveBeenCalledWith(
      'slot:slot_123',
      expect.objectContaining({
        slotId: 'slot_123',
        activeCreatives: [],
      }),
      expect.any(Object),
    );
  });

  it('writes the slot existence cache with a TTL that survives a missed refresh cycle', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    await pushSlotCache('slot_123');

    const slotCall = mockRedisSet.mock.calls.find((c: any) => c[0] === 'slot:slot_123');
    expect(slotCall).toBeDefined();
    const opts = slotCall![2];
    // The slot key encodes existence ("is this a real slot?"), not just freshness. It must
    // outlive the 10-min refresh cron by a wide margin so a skipped / slow / misconfigured
    // cron run can't silently evict a registered slot — which would make serving return
    // {empty:true}, drop the house ad, and suppress the type=pageview pixel (pageviews:0).
    expect(opts.ex).toBeGreaterThanOrEqual(24 * 60 * 60);
  });

  it('filters out creatives whose sensitiveCategories intersect blockedCategories', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: ['vedmal'] },
    };
    mockState.campaigns = [
      {
        id: 'camp_1',
        status: 'active',
        creativeIds: ['creative_clean', 'creative_gambling'],
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: { startsAt: new Date(Date.now() - 10000), endsAt: new Date(Date.now() + 10000) },
        targeting: { categories: ['taekni'] },
      },
    ];
    mockState.creatives = [
      {
        id: 'creative_clean',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/1.png',
        clickUrl: 'https://ex.com/1',
        autoScanResult: { category: 'retail', sensitiveCategories: [] },
      },
      {
        id: 'creative_gambling',
        reviewStatus: 'manual_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/2.png',
        clickUrl: 'https://ex.com/2',
        autoScanResult: { category: 'entertainment', sensitiveCategories: ['vedmal', 'rafmyntir'] },
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry.activeCreatives).toHaveLength(1);
    expect(entry.activeCreatives[0].creativeId).toBe('creative_clean');
  });

  it('serves a flagged creative when its flags do not intersect the blocks', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: ['afengi'] },
    };
    mockState.campaigns = [
      {
        id: 'camp_1',
        status: 'active',
        creativeIds: ['creative_politics'],
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: { startsAt: new Date(Date.now() - 10000), endsAt: new Date(Date.now() + 10000) },
        targeting: { categories: ['taekni'] },
      },
    ];
    mockState.creatives = [
      {
        id: 'creative_politics',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/3.png',
        clickUrl: 'https://ex.com/3',
        autoScanResult: { category: 'other', sensitiveCategories: ['politik'] },
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry.activeCreatives).toHaveLength(1);
    expect(entry.activeCreatives[0].creativeId).toBe('creative_politics');
  });

  it('fail-closed: excludes unscanned creatives when the publisher blocks anything', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: ['afengi'] },
    };
    mockState.campaigns = [
      {
        id: 'camp_1',
        status: 'active',
        creativeIds: ['creative_unscanned'],
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: { startsAt: new Date(Date.now() - 10000), endsAt: new Date(Date.now() + 10000) },
        targeting: { categories: ['taekni'] },
      },
    ];
    mockState.creatives = [
      {
        id: 'creative_unscanned',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/1.png',
        clickUrl: 'https://ex.com/1',
        autoScanResult: { category: 'retail' }, // no sensitiveCategories → never scanned for flags
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry.activeCreatives).toHaveLength(0);
  });

  it('ignores stale non-sensitive slugs in blockedCategories (no fail-closed from them)', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      // Legacy values from the old (broken) UI — must be treated as if nothing is blocked
      contentPolicy: { blockedCategories: ['Gambling', 'matur'] },
    };
    mockState.campaigns = [
      {
        id: 'camp_1',
        status: 'active',
        creativeIds: ['creative_unscanned'],
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: { startsAt: new Date(Date.now() - 10000), endsAt: new Date(Date.now() + 10000) },
        targeting: { categories: ['taekni'] },
      },
    ];
    mockState.creatives = [
      {
        id: 'creative_unscanned',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/1.png',
        clickUrl: 'https://ex.com/1',
        autoScanResult: { category: 'retail' },
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry.activeCreatives).toHaveLength(1); // stale slugs filtered → nothing blocked
    expect(entry.blockedCategories).toEqual([]); // cache entry carries the filtered list
  });

  it('passes campaign targeting.geoRegions into the cached creative', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'cmp_geo',
        status: 'active',
        creativeIds: ['creative_approved'],
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'], geoRegions: ['capital'] },
      },
    ];

    mockState.creatives = [
      {
        id: 'creative_approved',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/1.png',
        clickUrl: 'https://ex.com/1',
      },
    ];

    await pushSlotCache('slot_123');

    expect(mockRedisSet).toHaveBeenCalled();
    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    const c = entry.activeCreatives.find((x: any) => x.campaignId === 'cmp_geo');
    expect(c.geoRegions).toEqual(['capital']);
  });

  it('filters out creatives matching incorrect sizes', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_1',
        status: 'active',
        creativeIds: ['creative_right_size', 'creative_wrong_size'],
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'] },
      },
    ];

    mockState.creatives = [
      {
        id: 'creative_right_size',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/1.png',
        clickUrl: 'https://ex.com/1',
      },
      {
        id: 'creative_wrong_size',
        reviewStatus: 'auto_approved',
        width: 728,
        height: 90,
        imageUrl: 'https://ex.com/2.png',
        clickUrl: 'https://ex.com/2',
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    expect(entry.activeCreatives).toHaveLength(1);
    expect(entry.activeCreatives[0].creativeId).toBe('creative_right_size');
  });

  it('filters out campaigns with exhausted budget or expired schedules', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_no_budget',
        status: 'active',
        creativeIds: ['creative_approved'],
        budget: { remainingIsk: 0, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'] },
      },
      {
        id: 'camp_expired',
        status: 'active',
        creativeIds: ['creative_approved'],
        budget: { remainingIsk: 500, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 20000),
          endsAt: new Date(Date.now() - 1000),
        },
        targeting: { categories: ['taekni'] },
      },
    ];

    mockState.creatives = [
      {
        id: 'creative_approved',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/1.png',
        clickUrl: 'https://ex.com/1',
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    expect(entry.activeCreatives).toHaveLength(0);
  });

  it('enforces one creative per advertiser, prioritizing slot_purchased over cpm', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_cpm',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_cpm'],
        budget: { remainingIsk: 5000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'] },
      },
      {
        id: 'camp_sponsor',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_sponsor'],
        budget: { remainingIsk: 1000, mode: 'slot_purchased' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'] },
      },
    ];

    mockState.creatives = [
      {
        id: 'creative_cpm',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/cpm.png',
        clickUrl: 'https://ex.com/cpm',
      },
      {
        id: 'creative_sponsor',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/sponsor.png',
        clickUrl: 'https://ex.com/sponsor',
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    expect(entry.activeCreatives).toHaveLength(1);
    expect(entry.activeCreatives[0].campaignId).toBe('camp_sponsor');
    expect(entry.activeCreatives[0].creativeId).toBe('creative_sponsor');
  });

  it('enforces one creative per advertiser, prioritizing higher remaining budget for CPM', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_low_budget',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_low'],
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'] },
      },
      {
        id: 'camp_high_budget',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_high'],
        budget: { remainingIsk: 9000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'] },
      },
    ];

    mockState.creatives = [
      {
        id: 'creative_low',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/low.png',
        clickUrl: 'https://ex.com/low',
      },
      {
        id: 'creative_high',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/high.png',
        clickUrl: 'https://ex.com/high',
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    expect(entry.activeCreatives).toHaveLength(1);
    expect(entry.activeCreatives[0].campaignId).toBe('camp_high_budget');
    expect(entry.activeCreatives[0].creativeId).toBe('creative_high');
  });

  // DELIBERATE CHANGE OF AN OLD INVARIANT. This test previously asserted the
  // opposite ("enforces one creative per advertiser within the same campaign"):
  // the inner loop broke after the first usable creative, so a campaign could
  // never contribute more than one variant to a slot. That made the epsilon-
  // greedy rotation in apps/serving/src/lib/select.ts unreachable — there was
  // never a second variant of the same campaign to rotate against.
  //
  // What has NOT changed is the rule that actually protects advertisers from
  // each other: one CAMPAIGN per advertiser per slot (asserted just below).
  // Cross-campaign share is held even by selectCreative's two-stage draw, so
  // contributing extra variants buys a campaign no extra delivery.
  it('lets one campaign contribute every usable creative, so variants can be rotated', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_multi_creatives',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_first', 'creative_second'],
        budget: { remainingIsk: 5000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'] },
      },
    ];

    mockState.creatives = [
      {
        id: 'creative_first',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/1.png',
        clickUrl: 'https://ex.com/1',
      },
      {
        id: 'creative_second',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/2.png',
        clickUrl: 'https://ex.com/2',
      },
    ];

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    expect(entry.activeCreatives.map((c: any) => c.creativeId).sort()).toEqual([
      'creative_first',
      'creative_second',
    ]);
    expect(entry.activeCreatives.every((c: any) => c.campaignId === 'camp_multi_creatives')).toBe(
      true,
    );
  });

  it('still admits only ONE campaign per advertiser even when both have variants', async () => {
    mockState.slot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_123',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    const schedule = {
      startsAt: new Date(Date.now() - 10000),
      endsAt: new Date(Date.now() + 10000),
    };
    mockState.campaigns = [
      {
        id: 'camp_rich',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['cre_a1', 'cre_a2'],
        budget: { remainingIsk: 9000, mode: 'cpm_capped' },
        schedule,
        targeting: { categories: ['taekni'] },
      },
      {
        id: 'camp_poor',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['cre_b1', 'cre_b2'],
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule,
        targeting: { categories: ['taekni'] },
      },
    ];

    mockState.creatives = ['cre_a1', 'cre_a2', 'cre_b1', 'cre_b2'].map((id) => ({
      id,
      reviewStatus: 'auto_approved',
      width: 300,
      height: 250,
      imageUrl: `https://ex.com/${id}.png`,
      clickUrl: `https://ex.com/${id}`,
    }));

    await pushSlotCache('slot_123');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0].startsWith('slot:'))?.[1];
    const campaignIds = new Set(entry.activeCreatives.map((c: any) => c.campaignId));
    expect([...campaignIds]).toEqual(['camp_rich']);
    expect(entry.activeCreatives).toHaveLength(2);
  });

  it('bounds how many variants one campaign puts in a slot, and says so out loud', async () => {
    // The entry is fetched whole on every ad request, and creativeIds has no
    // upper bound, so an advertiser with a large creative library would otherwise
    // bloat every slot entry in their categories. Truncation must be logged —
    // a silent cap reads as "everything was cached" when it was not.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockState.slot = {
      id: 'slot_many',
      publisherId: 'pub_many',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 550 },
    };
    mockState.publisher = {
      id: 'pub_many',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };
    const ids = Array.from({ length: 12 }, (_, i) => `cre_${i}`);
    mockState.campaigns = [
      {
        id: 'cmp_many',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ids,
        budget: { remainingIsk: 5000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['taekni'] },
      },
    ];
    mockState.creatives = ids.map((id) => ({
      id,
      reviewStatus: 'auto_approved',
      width: 300,
      height: 250,
      imageUrl: `https://ex.com/${id}.png`,
      clickUrl: `https://ex.com/${id}`,
    }));

    await pushSlotCache('slot_many');

    const entry = mockRedisSet.mock.calls.find((c: any) => c[0] === 'slot:slot_many')?.[1];
    expect(entry.activeCreatives).toHaveLength(MAX_CACHED_VARIANTS_PER_CAMPAIGN);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cmp_many'));
    warn.mockRestore();
  });

  describe('CTR counters baked into the cache entry', () => {
    function seedTwoVariants() {
      mockState.slot = {
        id: 'slot_ctr',
        publisherId: 'pub_ctr',
        status: 'active',
        sizes: [{ width: 300, height: 250 }],
        pricing: { mode: 'cpm', cpmIsk: 550 },
      };
      mockState.publisher = {
        id: 'pub_ctr',
        status: 'active',
        categories: ['taekni'],
        contentPolicy: { blockedCategories: [] },
      };
      mockState.campaigns = [
        {
          id: 'cmp_ctr',
          advertiserId: 'adv_1',
          status: 'active',
          creativeIds: ['cre_x', 'cre_y'],
          budget: { remainingIsk: 5000, mode: 'cpm_capped' },
          schedule: {
            startsAt: new Date(Date.now() - 10000),
            endsAt: new Date(Date.now() + 10000),
          },
          targeting: { categories: ['taekni'] },
        },
      ];
      mockState.creatives = ['cre_x', 'cre_y'].map((id) => ({
        id,
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: `https://ex.com/${id}.png`,
        clickUrl: `https://ex.com/${id}`,
      }));
    }

    it('reads the counters and attaches them to each cached creative', async () => {
      seedTwoVariants();
      mockCtrHashes[ctrCounterKey('cmp_ctr', 'cre_x')] = { imp: '420', clk: '21' };
      mockCtrHashes[ctrCounterKey('cmp_ctr', 'cre_y')] = { imp: '380', clk: '4' };

      await pushSlotCache('slot_ctr');

      const entry = mockRedisSet.mock.calls.find((c: any) => c[0] === 'slot:slot_ctr')?.[1];
      const byId = Object.fromEntries(entry.activeCreatives.map((c: any) => [c.creativeId, c.ctr]));
      expect(byId.cre_x).toEqual({ imp: 420, clk: 21 });
      expect(byId.cre_y).toEqual({ imp: 380, clk: 4 });
    });

    it('reads every creative in ONE pipeline rather than a round trip each', async () => {
      seedTwoVariants();
      await pushSlotCache('slot_ctr');
      expect(mockPipelineCalls).toBe(1);
      expect(mockDirectHgetall).not.toHaveBeenCalled();
    });

    it('treats a creative with no counter hash as having no evidence yet', async () => {
      seedTwoVariants();
      await pushSlotCache('slot_ctr');

      const entry = mockRedisSet.mock.calls.find((c: any) => c[0] === 'slot:slot_ctr')?.[1];
      for (const c of entry.activeCreatives) {
        expect(c.ctr).toEqual({ imp: 0, clk: 0 });
      }
    });

    it('still writes the cache entry when the counter read fails, just without ctr', async () => {
      // Fail-safe: a Redis hiccup on an optimisation input must never cost the
      // publisher their ads. Selection reads a missing ctr as "no evidence" and
      // falls back to the even rotation.
      seedTwoVariants();
      mockCtrReadError = new Error('redis down');

      await pushSlotCache('slot_ctr');

      const entry = mockRedisSet.mock.calls.find((c: any) => c[0] === 'slot:slot_ctr')?.[1];
      expect(entry.activeCreatives).toHaveLength(2);
      for (const c of entry.activeCreatives) {
        expect(c.ctr).toBeUndefined();
      }
    });

    it('ignores a corrupt counter hash instead of writing NaN into the cache', async () => {
      seedTwoVariants();
      mockCtrHashes[ctrCounterKey('cmp_ctr', 'cre_x')] = { imp: 'oops', clk: null };

      await pushSlotCache('slot_ctr');

      const entry = mockRedisSet.mock.calls.find((c: any) => c[0] === 'slot:slot_ctr')?.[1];
      const x = entry.activeCreatives.find((c: any) => c.creativeId === 'cre_x');
      expect(x.ctr).toEqual({ imp: 0, clk: 0 });
    });
  });

  async function seedCategoryFixture() {
    mockState.publisher = {
      id: 'pub_food',
      status: 'active',
      categories: ['matur'],
      contentPolicy: { blockedCategories: [] },
    };
    mockState.publishers = [
      {
        id: 'pub_food',
        status: 'active',
        categories: ['matur'],
        contentPolicy: { blockedCategories: [] },
      },
      {
        id: 'pub_travel',
        status: 'active',
        categories: ['ferdalog'],
        contentPolicy: { blockedCategories: [] },
      },
    ];
    mockState.slot = {
      id: 'slot_food',
      publisherId: 'pub_food',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 550 },
    };
    mockState.slots = [
      {
        id: 'slot_food',
        publisherId: 'pub_food',
        status: 'active',
        sizes: [{ width: 300, height: 250 }],
        pricing: { mode: 'cpm', cpmIsk: 550 },
      },
      {
        id: 'slot_travel',
        publisherId: 'pub_travel',
        status: 'active',
        sizes: [{ width: 300, height: 250 }],
        pricing: { mode: 'cpm', cpmIsk: 550 },
      },
    ];
    mockState.campaigns = [
      {
        id: 'cmp_food',
        advertiserId: 'adv_active',
        status: 'active',
        creativeIds: ['cre_food'],
        budget: { remainingIsk: 5000, mode: 'cpm_capped', totalIsk: 10000 },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['matur'] },
      },
      {
        id: 'cmp_travel',
        advertiserId: 'adv_active',
        status: 'active',
        creativeIds: ['cre_travel'],
        budget: { remainingIsk: 5000, mode: 'cpm_capped', totalIsk: 10000 },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { categories: ['ferdalog'] },
      },
    ];
    mockState.creatives = [
      {
        id: 'cre_food',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/food.png',
        clickUrl: 'https://ex.com/food',
      },
      {
        id: 'cre_travel',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/travel.png',
        clickUrl: 'https://ex.com/travel',
      },
    ];
  }

  it('includes a campaign whose category matches the slot publisher, and excludes a non-matching one', async () => {
    await seedCategoryFixture();
    await pushSlotCache('slot_food');
    const slotCall = mockRedisSet.mock.calls.find((c: any) => c[0] === 'slot:slot_food');
    expect(slotCall).toBeDefined();
    const entry = slotCall[1];
    const campaignIds = entry.activeCreatives.map((c: any) => c.campaignId);
    expect(campaignIds).toContain('cmp_food');
    expect(campaignIds).not.toContain('cmp_travel');
  });

  it('pushCacheForCampaign refreshes every slot whose publisher matches the campaign categories', async () => {
    await seedCategoryFixture();
    mockRedisSet.mockClear();
    await pushCacheForCampaign('cmp_food');
    const slotCall = mockRedisSet.mock.calls.find((c: any) => c[0] === 'slot:slot_food');
    expect(slotCall).toBeDefined();
  });

  it('seeds pace_limit = round(remainingIsk / daysLeft) for active cpm_capped campaigns', async () => {
    mockState.slot = {
      id: 'slot_pace',
      publisherId: 'pub_pace',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_pace',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };

    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + 5); // 5 days left

    mockState.campaigns = [
      {
        id: 'cmp_pace',
        status: 'active',
        creativeIds: ['cre_pace'],
        budget: { remainingIsk: 50000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: endsAt,
        },
        targeting: { categories: ['taekni'] },
      },
    ];

    mockState.creatives = [
      {
        id: 'cre_pace',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/pace.png',
        clickUrl: 'https://ex.com/pace',
      },
    ];

    mockRedisSet.mockClear();
    await pushSlotCache('slot_pace');

    const paceCall = mockRedisSet.mock.calls.find((c: any) => c[0] === 'pace_limit:cmp_pace');
    expect(paceCall).toBeDefined();
    expect(paceCall![1]).toBe(10000); // 50000 / 5 = 10000 ISK
  });

  it('seeds pace_limit in pushCacheForCampaign as well', async () => {
    mockState.publisher = {
      id: 'pub_pace',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };
    mockState.slot = {
      id: 'slot_pace',
      publisherId: 'pub_pace',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.slots = [mockState.slot];

    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + 5);

    const campaign = {
      id: 'cmp_pace',
      status: 'active',
      creativeIds: ['cre_pace'],
      budget: { remainingIsk: 50000, mode: 'cpm_capped' },
      schedule: {
        startsAt: new Date(Date.now() - 10000),
        endsAt: endsAt,
      },
      targeting: { categories: ['taekni'] },
    };
    mockState.campaigns = [campaign];
    mockState.creatives = [
      {
        id: 'cre_pace',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/pace.png',
        clickUrl: 'https://ex.com/pace',
      },
    ];

    mockRedisSet.mockClear();
    await pushCacheForCampaign('cmp_pace');

    const paceCall = mockRedisSet.mock.calls.find((c: any) => c[0] === 'pace_limit:cmp_pace');
    expect(paceCall).toBeDefined();
    expect(paceCall![1]).toBe(10000);
  });

  it('seeds pace_limit over the actual flight window for future-start campaigns', async () => {
    mockState.slot = {
      id: 'slot_pace2',
      publisherId: 'pub_pace2',
      status: 'active',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 200 },
    };
    mockState.publisher = {
      id: 'pub_pace2',
      status: 'active',
      categories: ['taekni'],
      contentPolicy: { blockedCategories: [] },
    };
    mockState.campaigns = [
      {
        id: 'cmp_future',
        status: 'active',
        creativeIds: ['cre_future'],
        budget: { remainingIsk: 50000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() + 2 * 86_400_000), // starts in 2 days
          endsAt: new Date(Date.now() + 7 * 86_400_000), // 5 flight days
        },
        targeting: { categories: ['taekni'] },
      },
    ];
    mockState.creatives = [
      {
        id: 'cre_future',
        reviewStatus: 'auto_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/f.png',
        clickUrl: 'https://ex.com/f',
      },
    ];

    mockRedisSet.mockClear();
    await pushSlotCache('slot_pace2');

    const paceCall = mockRedisSet.mock.calls.find((c: any) => c[0] === 'pace_limit:cmp_future');
    expect(paceCall).toBeDefined();
    expect(paceCall![1]).toBe(10000); // 50000 / 5 flight days, not / 7 days-from-now
  });
});
