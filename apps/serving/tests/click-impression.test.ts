import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';
import { createSignature } from '../src/lib/crypto';

const mockSeenKeys = new Set<string>();
const mockIncrby = vi.fn(async () => 1);
const mockExpire = vi.fn(async () => true);
const mockIncrStore = new Map<string, number>();
const mockIncr = vi.fn(async (key: string) => {
  const current = mockIncrStore.get(key) ?? 0;
  const next = current + 1;
  mockIncrStore.set(key, next);
  return next;
});

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
    incrby: mockIncrby,
    incr: mockIncr,
    expire: mockExpire,
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

vi.mock('../src/lib/analytics', async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    logEvent: vi.fn(),
    decrementBudget: vi.fn(async () => 100),
  };
});

import { logEvent, decrementBudget } from '../src/lib/analytics';
import { recordVisitorImpression } from '../src/lib/visitor';
import app from '../src/index';

describe('GET /v1/click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeenKeys.clear();
    mockIncrStore.clear();
  });

  it('redirects to clickUrl for valid slot and creative', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
    const res = await app.request(`/v1/click?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`, {
      headers: { 'CF-IPCountry': 'IS' },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      'https://example/x?utm_source=birtingur&utm_medium=display&utm_campaign=cmp_a&utm_content=slot_a',
    );
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

  it('redirects to fallback destination and logs click for fallback creatives', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_fallback_birtingur', 'slot_empty', 'tok123', ts);
    const res = await app.request(
      `/v1/click?s=slot_empty&c=cre_fallback_birtingur&t=tok123&ts=${ts}&sig=${sig}`,
      {
        headers: { 'CF-IPCountry': 'IS' },
      },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://birtingur.app');
    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'click',
        slotId: 'slot_empty',
        creativeId: 'cre_fallback_birtingur',
        campaignId: 'cmp_fallback',
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

  it('deduplicates clicks within 30 seconds from same IP', async () => {
    const ts1 = Date.now();
    const sig1 = createSignature('cre_a', 'slot_a', 'tok1', ts1);
    const res1 = await app.request(`/v1/click?s=slot_a&c=cre_a&t=tok1&ts=${ts1}&sig=${sig1}`, {
      headers: { 'x-real-ip': '1.2.3.4' },
    });
    expect(res1.status).toBe(302);

    const ts2 = Date.now();
    const sig2 = createSignature('cre_a', 'slot_a', 'tok2', ts2);
    const res2 = await app.request(`/v1/click?s=slot_a&c=cre_a&t=tok2&ts=${ts2}&sig=${sig2}`, {
      headers: { 'x-real-ip': '1.2.3.4' },
    });
    expect(res2.status).toBe(302);

    expect(vi.mocked(logEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'click',
        visitorToken: 'tok1',
      }),
    );
  });

  it('drops logging for clicks exceeding the hourly rate limit but still redirects', async () => {
    for (let i = 1; i <= 4; i++) {
      mockSeenKeys.clear(); // clear deduplication lock
      const ts = Date.now() - 1000 - i;
      const sig = createSignature('cre_a', 'slot_a', `tok_${i}`, ts);
      const res = await app.request(`/v1/click?s=slot_a&c=cre_a&t=tok_${i}&ts=${ts}&sig=${sig}`, {
        headers: { 'x-real-ip': '1.2.3.4' },
      });
      expect(res.status).toBe(302);
    }

    expect(vi.mocked(logEvent)).toHaveBeenCalledTimes(3);
  });
});

describe('GET /v1/impression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeenKeys.clear();
    mockIncrStore.clear();
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

  it('increments pace_spent for the campaign on a charged impression', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);

    mockIncrby.mockClear();
    mockExpire.mockClear();

    const res = await app.request(`/v1/impression?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`);
    expect(res.status).toBe(200);

    const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(mockIncrby).toHaveBeenCalledWith(`pace_spent:cmp_a:${dayKey}`, 1); // 1000 CPM / 1000 = 1 ISK
    expect(mockExpire).toHaveBeenCalledWith(`pace_spent:cmp_a:${dayKey}`, 2 * 86400);
  });

  it('drops logging and budget/pacing increments for impressions exceeding the hourly limit but returns 200 pixel', async () => {
    for (let i = 1; i <= 31; i++) {
      const ts = Date.now() - 1000 - i;
      const sig = createSignature('cre_a', 'slot_a', `tok_${i}`, ts);
      const res = await app.request(
        `/v1/impression?s=slot_a&c=cre_a&t=tok_${i}&ts=${ts}&sig=${sig}`,
        {
          headers: { 'x-real-ip': '1.2.3.4' },
        },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/gif');
    }

    expect(vi.mocked(decrementBudget)).toHaveBeenCalledTimes(30);
    expect(vi.mocked(logEvent)).toHaveBeenCalledTimes(30);
  });

  it('drops pageview even when slot cache is empty (uncached slot)', async () => {
    const res = await app.request(
      '/v1/impression?s=slot_unknown&c=cre_fallback_birtingur&type=pageview',
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');

    // Pageviews with an uncached slot are silently dropped to avoid writing to a garbage Firestore path.
    expect(vi.mocked(logEvent)).not.toHaveBeenCalled();
  });

  it('drops pageview for cre_nocache creative (empty-response tracking pixel)', async () => {
    const res = await app.request('/v1/impression?s=slot_xyz&c=cre_nocache&type=pageview');
    expect(res.status).toBe(200);
    // Pageviews with an uncached slot are silently dropped to avoid writing to a garbage Firestore path.
    expect(vi.mocked(logEvent)).not.toHaveBeenCalled();
  });

  it('drops stale impression when slot cache expired between serve and view', async () => {
    // Creative exists in our mock but slot_b does NOT — simulating a TTL expiry
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_b', 'tok123', ts);
    const res = await app.request(`/v1/impression?s=slot_b&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`);
    expect(res.status).toBe(200);

    // Stale impressions are dropped entirely rather than logged with empty IDs.
    // Logging with empty campaignId would inflate publisher stats without crediting
    // any campaign, causing dashboard impression totals to diverge.
    expect(vi.mocked(logEvent)).not.toHaveBeenCalled();
  });
});
