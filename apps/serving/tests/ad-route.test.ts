import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';

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
  getSlotCache: vi.fn(async (id: string) => {
    if (id === 'slot_a') return mockSlot;
    if (id === 'slot_empty') return { ...mockSlot, slotId: 'slot_empty', activeCreatives: [] };
    return null;
  }),
  pushSlotCache: vi.fn(),
  invalidateSlot: vi.fn(),
}));

vi.mock('../src/lib/visitor', () => ({
  getOrCreateVisitorToken: vi.fn(() => 'tok123'),
  setCookieHeader: vi.fn(() => '_adp_v=tok123; Path=/'),
  getVisitorImpressionsToday: vi.fn(async () => ({})),
  recordVisitorImpression: vi.fn(),
}));

let mockBudgets: Record<string, number> = {};

vi.mock('../src/lib/analytics', () => ({
  logEvent: vi.fn(),
  decrementBudget: vi.fn(async () => 100),
  getRemainingBudgets: vi.fn(async (campaignIds: string[]) => {
    const out: Record<string, number> = {};
    campaignIds.forEach((id) => {
      out[id] = mockBudgets[id] ?? Number.POSITIVE_INFINITY;
    });
    return out;
  }),
}));

import app from '../src/index';

describe('GET /v1/ad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBudgets = {};
  });

  it('returns ad JSON for known slot', async () => {
    const res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: { 'CF-IPCountry': 'IS' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_a');
    expect(body.impressionPixel).toContain('/v1/impression?');
  });

  it('returns Birtingur house ad fallback for slot with no matching creatives', async () => {
    const res = await app.request('/v1/ad?slot=slot_empty&consent=none');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_birtingur');
    expect(body.imageUrl).toContain('data:image/svg+xml');
    expect(body.width).toBe(728);
    expect(body.height).toBe(90);
    expect(body.clickUrl).toBe('https://birtingur.app');
    expect(body.impressionPixel).toContain('type=pageview');
  });

  it('returns empty for unknown slot', async () => {
    const res = await app.request('/v1/ad?slot=missing&consent=none');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.empty).toBe(true);
  });

  it('400 when slot param missing', async () => {
    const res = await app.request('/v1/ad?consent=full');
    expect(res.status).toBe(400);
  });

  it('does not serve a creative whose campaign budget counter is exhausted', async () => {
    mockBudgets['cmp_a'] = 0;
    const res = await app.request('/v1/ad?slot=slot_a&consent=full');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_birtingur');
  });
});
