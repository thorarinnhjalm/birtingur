import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COLLECTIONS } from '@ada/shared/firestore';

let mockPublishers: any[] = [];
let mockCampaigns: any[] = [];
let mockStatsDocs: Record<string, any> = {};

vi.mock('../src/lib/firebase', () => {
  return {
    db: {
      collection: vi.fn((colName: string) => {
        return {
          where: vi.fn(() => ({
            withConverter: vi.fn(() => ({
              get: vi.fn(async () => {
                if (colName === 'publishers') {
                  return {
                    docs: mockPublishers.map((p) => ({
                      data: () => p,
                    })),
                  };
                }
                if (colName === 'campaigns') {
                  return {
                    docs: mockCampaigns.map((c) => ({
                      data: () => c,
                    })),
                  };
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

import { getCategoryInventory } from '../src/services/inventory';

describe('Inventory Service', () => {
  beforeEach(() => {
    mockPublishers = [];
    mockCampaigns = [];
    mockStatsDocs = {};
  });

  it('returns trailing 7-day average daily impressions per category', async () => {
    // 1. Seed publisher and 7 days of daily stats docs with 14000 impressions each
    mockPublishers.push({
      id: 'pub_food',
      status: 'active',
      categories: ['matur'],
    });

    const now = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dk = d.toISOString().split('T')[0]!.replace(/-/g, '');
      const path = `${COLLECTIONS.stats}/publishers/pub_food/${dk}`;
      mockStatsDocs[path] = { impressions: 14000 };
    }

    const result = await getCategoryInventory();
    const matur = result.find((r) => r.category === 'matur');
    expect(matur).toBeDefined();
    expect(matur!.avgDailyImpressions).toBe(14000);
  });

  it('subtracts committed impressions from gross to give availableDailyImpressions', async () => {
    // Fixture: publisher in ['matur'] with 7 daily stats docs of 11000 impressions each
    //   → gross avgDailyImpressions = 11000.
    mockPublishers.push({
      id: 'pub_food',
      status: 'active',
      categories: ['matur'],
    });

    const now = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dk = d.toISOString().split('T')[0]!.replace(/-/g, '');
      const path = `${COLLECTIONS.stats}/publishers/pub_food/${dk}`;
      mockStatsDocs[path] = { impressions: 11000 };
    }

    // Active cpm_capped campaign targeting ['matur'], remaining 27500 ISK, endsAt 5 days from now
    //   → dailyBudget = round(27500/5) = 5500 → dailyImpressions = round(5500/550*1000) = 10000.
    const endsAt = new Date(Date.now() + 5 * 86_400_000); // 5 days from now
    mockCampaigns.push({
      status: 'active',
      budget: {
        mode: 'cpm_capped',
        remainingIsk: 27500,
      },
      schedule: {
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt,
      },
      targeting: {
        categories: ['matur'],
      },
    });

    const result = await getCategoryInventory();
    const matur = result.find((r) => r.category === 'matur')!;
    expect(matur.avgDailyImpressions).toBe(11000);
    expect(matur.committedDailyImpressions).toBe(10000);
    expect(matur.availableDailyImpressions).toBe(1000);
  });

  function seedPublisherWithStats(impressionsPerDay: number) {
    mockPublishers.push({ id: 'pub_food', status: 'active', categories: ['matur'] });
    const now = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dk = d.toISOString().split('T')[0]!.replace(/-/g, '');
      mockStatsDocs[`${COLLECTIONS.stats}/publishers/pub_food/${dk}`] = {
        impressions: impressionsPerDay,
      };
    }
  }

  it('spreads a future flight over its actual flight days, not days-from-now', async () => {
    seedPublisherWithStats(11000);
    // Starts in 2 days, ends in 7 → 5 flight days. 27500 ISK / 5 = 5500/day → 10000 imp/day.
    // The old (broken) math would use 7 days → ~7857 imp/day.
    mockCampaigns.push({
      status: 'active',
      budget: { mode: 'cpm_capped', remainingIsk: 27500 },
      schedule: {
        startsAt: new Date(Date.now() + 2 * 86_400_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000),
      },
      targeting: { categories: ['matur'] },
    });

    const result = await getCategoryInventory();
    const matur = result.find((r) => r.category === 'matur')!;
    expect(matur.committedDailyImpressions).toBe(10000);
  });

  it('counts pending_approval campaigns as committed demand', async () => {
    seedPublisherWithStats(11000);
    mockCampaigns.push({
      status: 'pending_approval',
      budget: { mode: 'cpm_capped', remainingIsk: 27500 },
      schedule: {
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 5 * 86_400_000),
      },
      targeting: { categories: ['matur'] },
    });

    const result = await getCategoryInventory();
    const matur = result.find((r) => r.category === 'matur')!;
    expect(matur.committedDailyImpressions).toBe(10000);
  });

  it('does not count paused or already-ended campaigns', async () => {
    seedPublisherWithStats(11000);
    mockCampaigns.push(
      {
        status: 'paused',
        budget: { mode: 'cpm_capped', remainingIsk: 27500 },
        schedule: {
          startsAt: new Date(Date.now() - 86_400_000),
          endsAt: new Date(Date.now() + 5 * 86_400_000),
        },
        targeting: { categories: ['matur'] },
      },
      {
        status: 'active',
        budget: { mode: 'cpm_capped', remainingIsk: 27500 },
        schedule: {
          startsAt: new Date(Date.now() - 10 * 86_400_000),
          endsAt: new Date(Date.now() - 86_400_000), // already over
        },
        targeting: { categories: ['matur'] },
      },
    );

    const result = await getCategoryInventory();
    const matur = result.find((r) => r.category === 'matur')!;
    expect(matur.committedDailyImpressions).toBe(0);
  });
});
