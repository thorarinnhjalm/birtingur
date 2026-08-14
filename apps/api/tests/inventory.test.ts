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

import { getCategoryInventory, getCombinedCategoryInventory } from '../src/services/inventory';

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

  /**
   * A publisher declares 1..n categories and its whole daily volume is reported
   * under every one of them, because each category's figure answers "what could
   * I get if I bought this category". Summing those figures across a selection
   * therefore counts a publisher once per category it happens to be in.
   *
   * CampaignCreate.tsx did exactly that for "Laust pláss í N völdum flokkum",
   * and so did the oversell warning beside it — so one 1.000-impression
   * publisher in two categories read as 2.000 and the warning stayed silent for
   * campaigns that could never be delivered. MCP `list_categories` hands agents
   * the same figures and tells them to size the budget from them.
   *
   * The combined figure has to be computed where the publisher identities still
   * exist, which is here.
   */
  describe('combined inventory across a selection', () => {
    function seedPublisherWithDailyImpressions(id: string, categories: string[], perDay: number) {
      mockPublishers.push({ id, status: 'active', categories });
      const now = new Date();
      for (let i = 1; i <= 7; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dk = d.toISOString().split('T')[0]!.replace(/-/g, '');
        mockStatsDocs[`${COLLECTIONS.stats}/publishers/${id}/${dk}`] = { impressions: perDay };
      }
    }

    it('counts a publisher in two selected categories once, not twice', async () => {
      seedPublisherWithDailyImpressions('pub_both', ['matur', 'ferdalog'], 1000);

      const perCategory = await getCategoryInventory();
      // Each category still answers its own question, unchanged.
      expect(perCategory.find((r) => r.category === 'matur')!.avgDailyImpressions).toBe(1000);
      expect(perCategory.find((r) => r.category === 'ferdalog')!.avgDailyImpressions).toBe(1000);

      const combined = await getCombinedCategoryInventory(['matur', 'ferdalog']);
      // Summing the two would say 2.000 against a real capacity of 1.000.
      expect(combined.avgDailyImpressions).toBe(1000);
      expect(combined.availableDailyImpressions).toBe(1000);
    });

    it('adds publishers that do not overlap', async () => {
      seedPublisherWithDailyImpressions('pub_food', ['matur'], 1000);
      seedPublisherWithDailyImpressions('pub_life', ['ferdalog'], 400);

      const combined = await getCombinedCategoryInventory(['matur', 'ferdalog']);

      expect(combined.avgDailyImpressions).toBe(1400);
    });

    it('ignores publishers outside the selection entirely', async () => {
      seedPublisherWithDailyImpressions('pub_food', ['matur'], 1000);
      seedPublisherWithDailyImpressions('pub_tech', ['taekni'], 9000);

      const combined = await getCombinedCategoryInventory(['matur']);

      expect(combined.avgDailyImpressions).toBe(1000);
    });

    it('counts a campaign targeting two selected categories once as committed', async () => {
      seedPublisherWithDailyImpressions('pub_both', ['matur', 'ferdalog'], 1000);
      // 5.500 kr over 10 days is 550 kr/day, which at a 550 kr CPM buys exactly
      // 1.000 impressions a day. Counted twice it would consume 2.000 and drive
      // availability to zero.
      mockCampaigns.push({
        id: 'cmp_wide',
        status: 'active',
        budget: { mode: 'cpm_capped', remainingIsk: 5500 },
        targeting: { categories: ['matur', 'ferdalog'] },
        schedule: {
          startsAt: new Date(Date.now() - 86_400_000),
          endsAt: new Date(Date.now() + 10 * 86_400_000),
        },
      });

      const combined = await getCombinedCategoryInventory(['matur', 'ferdalog']);

      expect(combined.committedDailyImpressions).toBe(1000);
      expect(combined.availableDailyImpressions).toBe(0);
    });

    it('never reports negative availability', async () => {
      seedPublisherWithDailyImpressions('pub_food', ['matur'], 100);
      mockCampaigns.push({
        id: 'cmp_huge',
        status: 'active',
        budget: { mode: 'cpm_capped', remainingIsk: 5_500_000 },
        targeting: { categories: ['matur'] },
        schedule: {
          startsAt: new Date(Date.now() - 86_400_000),
          endsAt: new Date(Date.now() + 86_400_000),
        },
      });

      const combined = await getCombinedCategoryInventory(['matur']);

      expect(combined.availableDailyImpressions).toBe(0);
    });

    it("does not let one category's overcommitment drain another's inventory", async () => {
      // A campaign can only take impressions from publishers it actually
      // targets. Without that cap, a hugely oversubscribed campaign in a thin
      // category zeroed the whole combined figure, and the buy flow warned
      // against a campaign that would have delivered fine.
      seedPublisherWithDailyImpressions('pub_food', ['matur'], 5000);
      seedPublisherWithDailyImpressions('pub_cars', ['bilar'], 50);
      mockCampaigns.push({
        id: 'cmp_cars_huge',
        status: 'active',
        budget: { mode: 'cpm_capped', remainingIsk: 5_500_000 },
        targeting: { categories: ['bilar'] },
        schedule: {
          startsAt: new Date(Date.now() - 86_400_000),
          endsAt: new Date(Date.now() + 86_400_000),
        },
      });

      const combined = await getCombinedCategoryInventory(['matur', 'bilar']);

      expect(combined.avgDailyImpressions).toBe(5050);
      // The campaign can consume at most the 50 impressions its own category
      // produces, not the 10.000.000 its budget would buy.
      expect(combined.committedDailyImpressions).toBe(50);
      expect(combined.availableDailyImpressions).toBe(5000);
    });

    it('does not count paused or already-ended campaigns as demand', async () => {
      // The Firestore query filters these in production, but the loop re-checks
      // so the logic holds under a mock that ignores `.where()` — the same
      // reason the per-category function keeps its own check.
      seedPublisherWithDailyImpressions('pub_food', ['matur'], 1000);
      mockCampaigns.push({
        id: 'cmp_paused',
        status: 'paused',
        budget: { mode: 'cpm_capped', remainingIsk: 5500 },
        targeting: { categories: ['matur'] },
        schedule: {
          startsAt: new Date(Date.now() - 86_400_000),
          endsAt: new Date(Date.now() + 10 * 86_400_000),
        },
      });

      const combined = await getCombinedCategoryInventory(['matur']);

      expect(combined.committedDailyImpressions).toBe(0);
      expect(combined.availableDailyImpressions).toBe(1000);
    });

    it('agrees with the per-category figure for a single-category selection', async () => {
      // The two functions answer the same question when there is nothing to
      // deduplicate, and any divergence there is a second source of truth
      // rather than a design choice.
      seedPublisherWithDailyImpressions('pub_food', ['matur'], 1000);
      mockCampaigns.push({
        id: 'cmp_food',
        status: 'active',
        budget: { mode: 'cpm_capped', remainingIsk: 1100 },
        targeting: { categories: ['matur'] },
        schedule: {
          startsAt: new Date(Date.now() - 86_400_000),
          endsAt: new Date(Date.now() + 2 * 86_400_000),
        },
      });

      const perCategory = (await getCategoryInventory()).find((r) => r.category === 'matur')!;
      const combined = await getCombinedCategoryInventory(['matur']);

      expect(combined.avgDailyImpressions).toBe(perCategory.avgDailyImpressions);
      expect(combined.committedDailyImpressions).toBe(perCategory.committedDailyImpressions);
      expect(combined.availableDailyImpressions).toBe(perCategory.availableDailyImpressions);
    });

    it('returns zeroes for an empty selection rather than the whole network', async () => {
      seedPublisherWithDailyImpressions('pub_food', ['matur'], 1000);

      const combined = await getCombinedCategoryInventory([]);

      expect(combined.avgDailyImpressions).toBe(0);
      expect(combined.availableDailyImpressions).toBe(0);
    });
  });
});
