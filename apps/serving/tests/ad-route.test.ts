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
let mockPaceLimits: Record<string, number> = {};
let mockPaceSpent: Record<string, number> = {};

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
  getPaceState: vi.fn(async (campaignIds: string[]) => {
    const out: Record<string, { limit: number; spent: number }> = {};
    campaignIds.forEach((id) => {
      out[id] = {
        limit: mockPaceLimits[id] ?? Number.POSITIVE_INFINITY,
        spent: mockPaceSpent[id] ?? 0,
      };
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

  it('returns empty for unknown slot with pageview tracking pixel', async () => {
    const res = await app.request('/v1/ad?slot=missing&consent=none');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.empty).toBe(true);
    // Fix: now includes a tracking pixel even for uncached slots
    expect(body.impressionPixel).toBeDefined();
    expect(body.impressionPixel).toContain('type=pageview');
    expect(body.impressionPixel).toContain('s=missing');
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

  it('does not serve a creative whose campaign hit its daily pace limit', async () => {
    mockBudgets['cmp_a'] = 999999;
    mockPaceLimits['cmp_a'] = 100;
    mockPaceSpent['cmp_a'] = 100;
    const res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: { 'CF-IPCountry': 'IS' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_birtingur');
  });

  it('serves when under the daily pace limit', async () => {
    mockBudgets['cmp_a'] = 999999;
    mockPaceLimits['cmp_a'] = 100;
    mockPaceSpent['cmp_a'] = 10;
    const res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: { 'CF-IPCountry': 'IS' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_a');
  });

  it('gates creatives by geoRegion derived from x-vercel-ip-city header', async () => {
    // Modify active creative to target capital only
    mockSlot.activeCreatives[0]!.geoRegions = ['capital'];

    // 1. Reykjavik city header -> matches 'capital' -> serves the ad
    let res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: { 'x-vercel-ip-city': 'Reykjavík' },
    });
    expect(res.status).toBe(200);
    let body = await res.json();
    expect(body.creativeId).toBe('cre_a');

    // 2. Akureyri city header -> matches 'countryside' -> mismatch -> serves house ad fallback
    res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: { 'x-vercel-ip-city': 'Akureyri' },
    });
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_birtingur');

    // 3. Reset slot activeCreatives back to unrestricted (no geoRegions)
    delete mockSlot.activeCreatives[0]!.geoRegions;
  });

  it('filters creatives by requested width and height parameters', async () => {
    // 1. Matches size -> serves ad
    const resMatched = await app.request('/v1/ad?slot=slot_a&consent=full&w=728&h=90');
    expect(resMatched.status).toBe(200);
    const bodyMatched = await resMatched.json();
    expect(bodyMatched.creativeId).toBe('cre_a');

    // 2. Mismatches size -> serves fallback house ad matching requested dimensions
    const resMismatched = await app.request('/v1/ad?slot=slot_a&consent=full&w=300&h=250');
    expect(resMismatched.status).toBe(200);
    const bodyMismatched = await resMismatched.json();
    expect(bodyMismatched.creativeId).toBe('cre_fallback_birtingur');
    expect(bodyMismatched.width).toBe(300);
    expect(bodyMismatched.height).toBe(250);
  });
});

describe('Static script serving', () => {
  it('returns widget.js script', async () => {
    const res = await app.request('/widget.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
  });

  it('returns v1/widget.js script', async () => {
    const res = await app.request('/v1/widget.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
  });

  it('returns widgets.js script', async () => {
    const res = await app.request('/widgets.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
  });

  it('returns v1/widgets.js script', async () => {
    const res = await app.request('/v1/widgets.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
  });
});
