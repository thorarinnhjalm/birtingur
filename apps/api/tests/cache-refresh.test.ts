import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshAllActiveSlotCaches } from '../src/services/cache-refresh';

const mockPushSlotCache = vi.fn();
vi.mock('../src/lib/push-cache.js', () => ({
  pushSlotCache: (id: string) => mockPushSlotCache(id),
}));

const mockDocs = [
  { id: 'slot_active_1', data: () => ({ id: 'slot_active_1', status: 'active' }) },
  { id: 'slot_active_2', data: () => ({ id: 'slot_active_2', status: 'active' }) },
];

vi.mock('../src/lib/firebase.js', () => ({
  db: {
    collection: vi.fn((colName: string) => ({
      where: vi.fn((field: string, op: string, val: any) => ({
        withConverter: vi.fn(() => ({
          get: vi.fn(async () => {
            if (colName === 'slots' && field === 'status' && val === 'active') {
              return { docs: mockDocs };
            }
            return { docs: [] };
          }),
        })),
      })),
    })),
  },
}));

describe('Cache Refresh Service', () => {
  beforeEach(() => {
    mockPushSlotCache.mockClear();
  });

  it('rebuilds cache for every active slot', async () => {
    const count = await refreshAllActiveSlotCaches();
    expect(count).toBe(2);
    expect(mockPushSlotCache).toHaveBeenCalledTimes(2);
    expect(mockPushSlotCache).toHaveBeenCalledWith('slot_active_1');
    expect(mockPushSlotCache).toHaveBeenCalledWith('slot_active_2');
  });
});
