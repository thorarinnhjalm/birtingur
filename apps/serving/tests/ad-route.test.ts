import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';
import type { AdEvent } from '../src/lib/analytics';

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
    if (id === 'slot_transparent_empty')
      return {
        ...mockSlot,
        slotId: 'slot_transparent_empty',
        fallbackType: 'transparent',
        activeCreatives: [],
      };
    return null;
  }),
  pushSlotCache: vi.fn(),
  invalidateSlot: vi.fn(),
}));

vi.mock('../src/lib/visitor', () => ({
  getVisitorToken: vi.fn(() => 'tok123'),
  getVisitorImpressionsToday: vi.fn(async () => ({})),
  recordVisitorImpression: vi.fn(),
}));

let mockBudgets: Record<string, number> = {};
let mockPaceLimits: Record<string, number> = {};
let mockPaceSpent: Record<string, number> = {};
let logged: AdEvent[] = [];

function loggedEvents(): AdEvent[] {
  return logged;
}

vi.mock('../src/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    logEvent: vi.fn(async (ev: AdEvent) => {
      logged.push(ev);
    }),
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
  };
});

import app from '../src/index';

describe('GET /v1/ad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBudgets = {};
    logged = [];
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

  it('logs the slot load with wire type pageview (creativeId is the marker) and returns a signed pageviewPixel on the fill path', async () => {
    const res = await app.request('/v1/ad?slot=slot_a&consent=full');
    const body = await res.json();
    expect(body.pageviewPixel).toMatch(/^\/v1\/pageview\?s=slot_a&t=.*&ts=\d+&sig=[a-f0-9]+$/);
    // Wire type stays 'pageview' — see AdEvent.type in lib/analytics.ts — deploy-order
    // safety depends on this NOT being a distinct type. The real/fallback creativeId is
    // what marks it as a slot load, not a true page view.
    expect(loggedEvents().map((e) => e.type)).toEqual(['pageview']);
    expect(loggedEvents()[0]!.creativeId).toBe('cre_a');
  });

  it('logs the slot load with wire type pageview and returns a pageviewPixel on the no-fill path too', async () => {
    const res = await app.request('/v1/ad?slot=slot_empty&consent=none');
    const body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_birtingur');
    expect(body.pageviewPixel).toMatch(/^\/v1\/pageview\?s=slot_empty&t=.*&ts=\d+&sig=[a-f0-9]+$/);
    expect(loggedEvents().map((e) => e.type)).toEqual(['pageview']);
    expect(loggedEvents()[0]!.creativeId).toBe('cre_fallback_birtingur');
  });

  it('stamps botClass on the slot-load event from a crawler request', async () => {
    const res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    expect(res.status).toBe(200);
    expect(loggedEvents().every((e) => e.botClass === 'known_bot')).toBe(true);
  });

  it('stamps human for an ordinary browser request', async () => {
    const res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'accept-language': 'is,en;q=0.9',
      },
    });
    expect(res.status).toBe(200);
    expect(loggedEvents().every((e) => e.botClass === 'human')).toBe(true);
  });

  it('stamps botClass on the no-fill fallback slot-load event too', async () => {
    const res = await app.request('/v1/ad?slot=slot_empty&consent=none', {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    expect(res.status).toBe(200);
    expect(loggedEvents().every((e) => e.botClass === 'known_bot')).toBe(true);
  });

  it('returns Birtingur house ad fallback for slot with no matching creatives', async () => {
    const res = await app.request('/v1/ad?slot=slot_empty&consent=none');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_birtingur');
    expect(body.imageUrl).toContain('data:image/svg+xml');
    expect(body.width).toBe(728);
    expect(body.height).toBe(90);
    expect(body.clickUrl).toContain('/v1/click?c=cre_fallback_birtingur');
    expect(body.impressionPixel).toContain('type=pageview');
  });

  it('returns transparent fallback when fallbackType is transparent and no matching creatives', async () => {
    const res = await app.request('/v1/ad?slot=slot_transparent_empty&consent=none');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_fallback_transparent');
    expect(body.imageUrl).toBe(
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    );
    expect(body.clickUrl).toBe('');
    expect(body.width).toBe(728);
    expect(body.height).toBe(90);
    expect(body.showBacklink).toBe(false);
    expect(body.impressionPixel).toContain('c=cre_fallback_transparent');
    expect(body.impressionPixel).toContain('type=pageview');
  });

  it('returns empty for unknown slot with an impression tracking pixel but no pageviewPixel', async () => {
    const res = await app.request('/v1/ad?slot=missing&consent=none');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.empty).toBe(true);
    // Fix: now includes a tracking pixel even for uncached slots
    expect(body.impressionPixel).toBeDefined();
    expect(body.impressionPixel).toContain('type=pageview');
    expect(body.impressionPixel).toContain('s=missing');
    // A true cache miss has no publisherId to attribute a slot load to, so
    // nothing is logged at serve time here — recovery (if the cache warms up
    // before the legacy pixel fires) is impression.ts's job, not ad.ts's.
    //
    // No pageviewPixel on this response (IMPORTANT-2, 2026-08-09 fix wave):
    // cache-miss responses return fastest of all and would otherwise
    // systematically win the snippet's one-shot pageview race, burning the
    // page's one true page view on a slot that couldn't even be attributed —
    // even when other, cached slots on the same page could have reported it.
    expect(body.pageviewPixel).toBeUndefined();
    expect(loggedEvents()).toHaveLength(0);
  });

  it('400 when slot param missing', async () => {
    const res = await app.request('/v1/ad?consent=full');
    expect(res.status).toBe(400);
  });

  // Birtingur is a cookie-free ad network: the only visitor identifier is the
  // consent-gated first-party id the snippet keeps in the publisher's own
  // localStorage and passes as ?vid=. The serving origin must never set a
  // cookie of its own — a cross-site Set-Cookie here would silently make the
  // "engar vafrakökur" claim false for every publisher on the network.
  it('never sets a cookie when serving a creative', async () => {
    const res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: { 'CF-IPCountry': 'IS' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('never sets a cookie when serving the house-ad fallback', async () => {
    const res = await app.request('/v1/ad?slot=slot_empty&consent=none');
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
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
