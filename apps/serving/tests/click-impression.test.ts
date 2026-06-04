import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';
import { createSignature } from '../src/lib/crypto';

const mockSeenKeys = new Set<string>();

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, val: string, options?: { nx?: boolean; ex?: number }) => {
      if (options?.nx) {
        if (mockSeenKeys.has(key)) {
          return null;
        }
        mockSeenKeys.add(key);
        return 'OK';
      }
      return 'OK';
    }),
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
  getOrCreateVisitorToken: vi.fn(() => 'tok123'),
  setCookieHeader: vi.fn(() => '_adp_v=tok123; Path=/'),
  getVisitorImpressionsToday: vi.fn(async () => ({})),
  recordVisitorImpression: vi.fn(),
}));

vi.mock('../src/lib/analytics', () => ({
  logEvent: vi.fn(),
  decrementBudget: vi.fn(async () => 100),
}));

import { logEvent, decrementBudget } from '../src/lib/analytics';
import { recordVisitorImpression } from '../src/lib/visitor';
import app from '../src/index';

describe('GET /v1/click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeenKeys.clear();
  });

  it('redirects to clickUrl for valid slot and creative', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
    const res = await app.request(`/v1/click?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`, {
      headers: { 'CF-IPCountry': 'IS' },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://example/x');
    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'click',
        slotId: 'slot_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        campaignId: 'cmp_a',
        country: 'IS',
        visitorToken: 'tok123',
      }),
    );
  });

  it('returns 400 when missing query parameters', async () => {
    const res = await app.request('/v1/click?s=slot_a');
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown slot or creative', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_b', '', ts);
    const res = await app.request(`/v1/click?s=slot_b&c=cre_a&ts=${ts}&sig=${sig}`);
    expect(res.status).toBe(404);
  });

  it('counts a replayed signed click only once', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
    const url = `/v1/click?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`;
    const first = await app.request(url, { headers: { 'CF-IPCountry': 'IS' } });
    const second = await app.request(url, { headers: { 'CF-IPCountry': 'IS' } });
    expect(first.status).toBe(302);
    expect(second.status).toBe(409); // replay rejected
  });
});

describe('GET /v1/impression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeenKeys.clear();
  });

  it('returns transparent pixel and processes impression for valid slot and creative', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
    const res = await app.request(`/v1/impression?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');

    expect(vi.mocked(recordVisitorImpression)).toHaveBeenCalledWith('tok123', 'cre_a');
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledWith('cmp_a', 1); // 1000 cpm / 1000 = 1 isk
  });

  it('returns pixel even when missing query parameters', async () => {
    const res = await app.request('/v1/impression?s=slot_a');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');
    expect(vi.mocked(recordVisitorImpression)).not.toHaveBeenCalled();
    expect(vi.mocked(decrementBudget)).not.toHaveBeenCalled();
  });

  it('ignores a replayed signed impression', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
    const url = `/v1/impression?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`;
    const first = await app.request(url);
    const second = await app.request(url);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // The first one records the impression and decrements the budget, the second one does not (silently ignored)
    expect(vi.mocked(recordVisitorImpression)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledTimes(1);
  });
});
