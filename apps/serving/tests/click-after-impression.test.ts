import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';

// The production sequence for one served ad: GET /v1/ad, the snippet fires
// impressionPixel after the IAB viewability delay, and the visitor may then
// click clickUrl. Both URLs come from the SAME /v1/ad response. The existing
// click and impression suites each exercise only one of the two with the
// replay-guard store cleared in between, so a collision between them is
// invisible there — this file drives the whole sequence against one ad.

const mockSeenKeys = new Set<string>();

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, _val: string, options?: { nx?: boolean; ex?: number }) => {
      if (options?.nx) {
        if (mockSeenKeys.has(key)) return null;
        mockSeenKeys.add(key);
        return 'OK';
      }
      return 'OK';
    }),
    incrby: vi.fn(async () => 1),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => true),
  }),
}));

const mockSlot: SlotCacheEntry = {
  slotId: 'slot_a',
  publisherId: 'pub_a',
  sizes: [{ width: 728, height: 90 }],
  pricing: { mode: 'cpm', cpmIsk: 1000 },
  activeCreatives: [
    {
      creativeId: 'cre_a',
      campaignId: 'cmp_a',
      imageUrl: 'https://example/a.png',
      clickUrl: 'https://example/x',
      width: 728,
      height: 90,
      weight: 1,
      frequencyCapPerDay: 3,
      budgetExhausted: false,
      validFrom: Date.now() - 1000,
      validTo: Date.now() + 60000,
      priority: 'cpm',
    },
  ],
  blockedCategories: [],
  refreshedAt: Date.now(),
};

vi.mock('../src/lib/cache', () => ({
  getSlotCache: vi.fn(async (id: string) => (id === 'slot_a' ? mockSlot : null)),
  pushSlotCache: vi.fn(),
  invalidateSlot: vi.fn(),
}));

vi.mock('../src/lib/visitor', () => ({
  getVisitorToken: vi.fn(() => 'tok123'),
  getVisitorImpressionsToday: vi.fn(async () => ({})),
  recordVisitorImpression: vi.fn(),
}));

vi.mock('../src/lib/analytics', () => ({
  logEvent: vi.fn(),
  decrementBudget: vi.fn(async () => 100),
  incrementPaceSpent: vi.fn(),
  getRemainingBudgets: vi.fn(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, Number.POSITIVE_INFINITY])),
  ),
  getPaceState: vi.fn(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { limit: Number.POSITIVE_INFINITY, spent: 0 }])),
  ),
}));

import { decrementBudget } from '../src/lib/analytics';
import app from '../src/index';

async function serveAd(): Promise<{ impressionPixel: string; clickUrl: string }> {
  const res = await app.request('/v1/ad?slot=slot_a&w=728&h=90', {
    headers: { 'CF-IPCountry': 'IS' },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { impressionPixel: string; clickUrl: string };
}

describe('one served ad: impression and click both count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeenKeys.clear();
  });

  it('still redirects the click after the impression pixel for the same ad has fired', async () => {
    const ad = await serveAd();

    const pixelRes = await app.request(ad.impressionPixel);
    expect(pixelRes.status).toBe(200);
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledTimes(1);

    const clickRes = await app.request(ad.clickUrl, { headers: { 'CF-IPCountry': 'IS' } });

    expect(clickRes.status).toBe(302);
    expect(clickRes.headers.get('Location')).toContain('https://example/x');
  });

  // The same collision in the other direction: a visitor who clicks before the
  // viewability delay elapses used to burn the signature on the click, and the
  // impression that followed was silently dropped — the ad was delivered and
  // clicked but never charged.
  it('still charges the impression when the click for the same ad came first', async () => {
    const ad = await serveAd();

    const clickRes = await app.request(ad.clickUrl, { headers: { 'CF-IPCountry': 'IS' } });
    expect(clickRes.status).toBe(302);

    const pixelRes = await app.request(ad.impressionPixel);

    expect(pixelRes.status).toBe(200);
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledWith('cmp_a', 1);
  });
});
