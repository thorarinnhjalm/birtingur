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
        return {
          id: ref.id,
          exists: creative !== undefined,
          data: () => creative,
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

    expect(mockRedisSet).toHaveBeenCalledTimes(1);
    const entry = mockRedisSet.mock.calls[0][1];
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

    const entry = mockRedisSet.mock.calls[0][1];
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

    const entry = mockRedisSet.mock.calls[0][1];
    expect(entry.activeCreatives).toHaveLength(0);
  });
});
