import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firestore store
const mockStatsStore = new Map<string, any>();

vi.mock('../src/lib/firebase.js', () => ({
  db: {
    doc: vi.fn((path: string) => ({
      get: vi.fn(async () => {
        const data = mockStatsStore.get(path);
        return {
          exists: data !== undefined,
          data: () => data,
        };
      }),
    })),
  },
}));

vi.mock('../src/services/campaigns.js', () => ({
  getCampaign: vi.fn(async (id: string) => {
    if (id === 'cmp_a') {
      return { id: 'cmp_a', name: 'Campaign A', advertiserId: 'adv_a' };
    }
    return null;
  }),
}));

vi.mock('../src/services/advertisers.js', () => ({
  getAdvertiserById: vi.fn(async (id: string) => {
    if (id === 'adv_a') {
      return { id: 'adv_a', companyName: 'Advertiser A' };
    }
    return null;
  }),
}));

import { getSlotStats } from '../src/services/slot-stats.js';

describe('getSlotStats service', () => {
  beforeEach(() => {
    mockStatsStore.clear();
  });

  /**
   * `unfilled` is only written from 2026-08-14, but `pageviews` counts every day
   * in the window, so a fill rate built from the two compared a few days against
   * thirty. The slot page showed the result of that, same as the dashboard did.
   */
  it('pairs the fill denominator with the days that measured unfilled', async () => {
    const now = new Date();
    const dk = (daysAgo: number) => {
      const d = new Date(now);
      d.setDate(now.getDate() - daysAgo);
      return d.toISOString().split('T')[0]!.replace(/-/g, '');
    };
    // An unmeasured day carrying most of the traffic, and one measured day.
    mockStatsStore.set(`stats/publisher_slots/pub_f_slot_f/${dk(3)}`, {
      impressions: 700,
      clicks: 0,
      spendIsk: 0,
      pageviews: 900,
    });
    mockStatsStore.set(`stats/publisher_slots/pub_f_slot_f/${dk(1)}`, {
      impressions: 60,
      clicks: 0,
      spendIsk: 0,
      pageviews: 100,
      unfilled: 40,
    });

    const stats = await getSlotStats('pub_f', 'slot_f', 7);

    expect(stats.pageviews).toBe(1000);
    expect(stats.unfilled).toBe(40);
    // 100, not 1000: fill is (100-40)/100 = 60%. Against the window it would
    // read 96%.
    expect(stats.requestsWithFillData).toBe(100);
  });

  async function seedSlotStats(publisherId: string, slotId: string) {
    const now = new Date();

    // Today
    const todayStr = now.toISOString().split('T')[0]!;
    const todayDk = todayStr.replace(/-/g, '');
    mockStatsStore.set(`stats/publisher_slots/${publisherId}_${slotId}/${todayDk}`, {
      impressions: 100,
      clicks: 5,
      spendIsk: 150,
      pageviews: 120,
      byCampaign: {
        cmp_a: { impressions: 100, clicks: 5 },
      },
    });

    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]!;
    const yesterdayDk = yesterdayStr.replace(/-/g, '');
    mockStatsStore.set(`stats/publisher_slots/${publisherId}_${slotId}/${yesterdayDk}`, {
      impressions: 100,
      clicks: 5,
      spendIsk: 150,
      pageviews: 120,
      byCampaign: {
        cmp_a: { impressions: 100, clicks: 5 },
      },
    });
  }

  it('sums per-slot daily stats over the timeframe and returns a history array', async () => {
    await seedSlotStats('pub_1', 'slot_1');
    const stats = await getSlotStats('pub_1', 'slot_1', 7);
    expect(stats.impressions).toBe(200);
    expect(stats.clicks).toBe(10);
    expect(stats.spendIsk).toBe(300);
    expect(stats.pageviews).toBe(240);
    expect(stats.history).toHaveLength(7);
    expect(stats.history.at(-1)!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify campaign aggregation and metadata resolution
    expect(stats.byCampaign).toBeDefined();
    const cmp = stats.byCampaign!.cmp_a!;
    expect(cmp).toBeDefined();
    expect(cmp.campaignName).toBe('Campaign A');
    expect(cmp.advertiserName).toBe('Advertiser A');
    expect(cmp.impressions).toBe(200);
    expect(cmp.clicks).toBe(10);
    expect(cmp.earningsIsk).toBe(Math.round((200 / 1000) * 550 * 0.8));
  });
});
