import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCreativeStats } from '../src/services/creative-stats';

let mockStatsDocs: Record<string, any> = {};

vi.mock('../src/lib/firebase', () => ({
  db: {
    doc: vi.fn((path: string) => ({
      get: vi.fn(async () => ({
        exists: mockStatsDocs[path] !== undefined,
        data: () => mockStatsDocs[path],
      })),
    })),
  },
  auth: {},
  storage: {},
}));

describe('getCreativeStats', () => {
  beforeEach(() => {
    mockStatsDocs = {};
  });

  it('returns zeros when no stats exist', async () => {
    const result = await getCreativeStats('cre_nonexistent', 24);
    expect(result.impressions).toBe(0);
    expect(result.clicks).toBe(0);
    expect(result.ctr).toBe(0);
    expect(result.hours).toHaveLength(0);
  });

  it('aggregates impressions and clicks from hourly docs', async () => {
    const now = new Date();
    // Seed stats for the current hour and 1 hour ago
    const h0 = new Date(now.getTime());
    const hk0 =
      h0.getUTCFullYear().toString() +
      String(h0.getUTCMonth() + 1).padStart(2, '0') +
      String(h0.getUTCDate()).padStart(2, '0') +
      String(h0.getUTCHours()).padStart(2, '0');

    const h1 = new Date(now.getTime() - 3600_000);
    const hk1 =
      h1.getUTCFullYear().toString() +
      String(h1.getUTCMonth() + 1).padStart(2, '0') +
      String(h1.getUTCDate()).padStart(2, '0') +
      String(h1.getUTCHours()).padStart(2, '0');

    mockStatsDocs[`stats/creatives/cre_abc/${hk0}`] = {
      impressions: 100,
      clicks: 5,
    };
    mockStatsDocs[`stats/creatives/cre_abc/${hk1}`] = {
      impressions: 200,
      clicks: 10,
    };

    const result = await getCreativeStats('cre_abc', 24);
    expect(result.impressions).toBe(300);
    expect(result.clicks).toBe(15);
    expect(result.ctr).toBeCloseTo(5.0, 1); // 15/300 * 100 = 5%
    expect(result.hours).toHaveLength(2);
  });

  it('calculates CTR correctly', async () => {
    const now = new Date();
    const hk =
      now.getUTCFullYear().toString() +
      String(now.getUTCMonth() + 1).padStart(2, '0') +
      String(now.getUTCDate()).padStart(2, '0') +
      String(now.getUTCHours()).padStart(2, '0');

    mockStatsDocs[`stats/creatives/cre_ctr/${hk}`] = {
      impressions: 1000,
      clicks: 25,
    };

    const result = await getCreativeStats('cre_ctr', 24);
    expect(result.ctr).toBeCloseTo(2.5, 1); // 25/1000 * 100 = 2.5%
  });
});
