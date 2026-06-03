import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchSlots } from '../src/services/slot-search';

interface MockSlot {
  id: string;
  publisherId: string;
  name: string;
  sizes: Array<{ width: number; height: number }>;
  pricing: {
    mode: 'cpm' | 'slot';
    cpmIsk?: number;
    slotPriceIsk?: number;
    slotPeriodDays?: number;
  };
  placement: {
    pageMatcher: string;
    position: string;
  };
  status: string;
}

let mockSlots: MockSlot[] = [];

vi.mock('../src/lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        withConverter: vi.fn(() => ({
          get: vi.fn(async () => {
            const filtered = mockSlots.filter((s) => s.status === 'active');
            return {
              docs: filtered.map((s) => ({
                data: () => s,
              })),
            };
          }),
        })),
      })),
    })),
  },
  auth: {},
  storage: {},
}));

describe('Slot Search Service', () => {
  beforeEach(() => {
    mockSlots = [];
  });

  it('filters by size', async () => {
    mockSlots = [
      {
        id: 'slot_1',
        publisherId: 'pub_123',
        name: '728',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1500 },
        placement: { pageMatcher: '/', position: 'above_fold' },
        status: 'active',
      },
      {
        id: 'slot_2',
        publisherId: 'pub_123',
        name: '300',
        sizes: [{ width: 300, height: 250 }],
        pricing: { mode: 'cpm', cpmIsk: 1200 },
        placement: { pageMatcher: '/', position: 'sidebar' },
        status: 'active',
      },
    ];

    const found = await searchSlots({ width: 728, height: 90 });
    expect(found.map((s) => s.name)).toEqual(['728']);
  });

  it('filters by maxCpm', async () => {
    mockSlots = [
      {
        id: 'slot_1',
        publisherId: 'pub_123',
        name: 'expensive',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 3000 },
        placement: { pageMatcher: '/', position: 'above_fold' },
        status: 'active',
      },
      {
        id: 'slot_2',
        publisherId: 'pub_123',
        name: 'cheap',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1000 },
        placement: { pageMatcher: '/', position: 'above_fold' },
        status: 'active',
      },
    ];

    const found = await searchSlots({ maxCpm: 1500 });
    expect(found.map((s) => s.name)).toEqual(['cheap']);
  });
});
