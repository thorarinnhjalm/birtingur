import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSlotStats } from '../src/services/slot-stats.js';

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

describe('getSlotStats service', () => {
  beforeEach(() => {
    mockStatsStore.clear();
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
  });
});
