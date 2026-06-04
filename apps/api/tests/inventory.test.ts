import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COLLECTIONS } from '@ada/shared/firestore';

let mockPublishers: any[] = [];
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
});
