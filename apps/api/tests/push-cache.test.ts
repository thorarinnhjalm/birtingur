import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define a unified mock data holder that Vitest will hoist since its name starts with "mock"
interface MockState {
  slot: Record<string, unknown> | null;
  publisher: Record<string, unknown> | null;
  campaigns: Record<string, unknown>[];
  creatives: Array<{ id: string; [key: string]: unknown }>;
}

const mockState: MockState = {
  slot: null,
  publisher: null,
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
                return {
                  exists: mockState.slot !== null,
                  data: () => mockState.slot,
                };
              }
              if (colName === 'publishers') {
                return {
                  exists: mockState.publisher !== null,
                  data: () => mockState.publisher,
                };
              }
              return { exists: false, data: () => null };
            }),
          })),
        })),
        where: vi.fn(() => {
          const builder = {
            where: vi.fn(() => builder),
            withConverter: vi.fn(() => ({
              get: vi.fn(async () => {
                if (colName === 'campaigns') {
                  return {
                    docs: mockState.campaigns.map((c) => ({
                      data: () => c,
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

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    set: mockRedisSet,
    del: mockRedisDel,
  }),
}));

import { pushSlotCache } from '../src/lib/push-cache';

describe('pushSlotCache helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.slot = null;
    mockState.publisher = null;
    mockState.campaigns = [];
    mockState.creatives = [];
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

  it('filters out creatives matching blocked categories', async () => {
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
      contentPolicy: { blockedCategories: ['Gambling'] },
    };

    mockState.campaigns = [
      {
        id: 'camp_1',
        status: 'active',
        creativeIds: ['creative_approved', 'creative_blocked'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { slotIds: ['slot_123'] },
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
        autoScanResult: { category: 'Tech' },
      },
      {
        id: 'creative_blocked',
        reviewStatus: 'manual_approved',
        width: 300,
        height: 250,
        imageUrl: 'https://ex.com/2.png',
        clickUrl: 'https://ex.com/2',
        autoScanResult: { category: 'Gambling' },
      },
    ];

    await pushSlotCache('slot_123');

    expect(mockRedisSet).toHaveBeenCalled();
    const entry = mockRedisSet.mock.calls.find((c) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    expect(entry.activeCreatives).toHaveLength(1);
    expect(entry.activeCreatives[0].creativeId).toBe('creative_approved');
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
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_1',
        status: 'active',
        creativeIds: ['creative_right_size', 'creative_wrong_size'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { slotIds: ['slot_123'] },
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

    const entry = mockRedisSet.mock.calls.find((c) => c[0].startsWith('slot:'))?.[1];
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
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_no_budget',
        status: 'active',
        creativeIds: ['creative_approved'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 0, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { slotIds: ['slot_123'] },
      },
      {
        id: 'camp_expired',
        status: 'active',
        creativeIds: ['creative_approved'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 500, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 20000),
          endsAt: new Date(Date.now() - 1000),
        },
        targeting: { slotIds: ['slot_123'] },
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

    const entry = mockRedisSet.mock.calls.find((c) => c[0].startsWith('slot:'))?.[1];
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
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_cpm',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_cpm'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 5000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { slotIds: ['slot_123'] },
      },
      {
        id: 'camp_sponsor',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_sponsor'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 1000, mode: 'slot_purchased' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { slotIds: ['slot_123'] },
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

    const entry = mockRedisSet.mock.calls.find((c) => c[0].startsWith('slot:'))?.[1];
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
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_low_budget',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_low'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 1000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { slotIds: ['slot_123'] },
      },
      {
        id: 'camp_high_budget',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_high'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 9000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { slotIds: ['slot_123'] },
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

    const entry = mockRedisSet.mock.calls.find((c) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    expect(entry.activeCreatives).toHaveLength(1);
    expect(entry.activeCreatives[0].campaignId).toBe('camp_high_budget');
    expect(entry.activeCreatives[0].creativeId).toBe('creative_high');
  });

  it('enforces one creative per advertiser within the same campaign', async () => {
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
      contentPolicy: { blockedCategories: [] },
    };

    mockState.campaigns = [
      {
        id: 'camp_multi_creatives',
        advertiserId: 'adv_1',
        status: 'active',
        creativeIds: ['creative_first', 'creative_second'],
        perPublisherApproval: { pub_123: 'approved' },
        budget: { remainingIsk: 5000, mode: 'cpm_capped' },
        schedule: {
          startsAt: new Date(Date.now() - 10000),
          endsAt: new Date(Date.now() + 10000),
        },
        targeting: { slotIds: ['slot_123'] },
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

    const entry = mockRedisSet.mock.calls.find((c) => c[0].startsWith('slot:'))?.[1];
    expect(entry).toBeDefined();
    expect(entry.activeCreatives).toHaveLength(1);
    expect(entry.activeCreatives[0].campaignId).toBe('camp_multi_creatives');
    expect(entry.activeCreatives[0].creativeId).toBe('creative_first');
  });
});
