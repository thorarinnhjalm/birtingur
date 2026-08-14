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
// Hoisted (not recreated per getRedis() call) so tests can assert on it directly —
// this is the seam that proves claimSignatureOnce's SET NX actually ran, for
// branches where the claim has no other observable side effect (nothing logged).
const mockSet = vi.fn(
  async (key: string, _val: string, options?: { nx?: boolean; ex?: number }) => {
    if (options?.nx) {
      if (mockSeenKeys.has(key)) {
        return null;
      }
      mockSeenKeys.add(key);
      return 'OK';
    }
    return 'OK';
  },
);

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    set: mockSet,
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

  it('stamps botClass on the click event from a crawler request', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
    const res = await app.request(`/v1/click?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`, {
      headers: {
        'CF-IPCountry': 'IS',
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    expect(res.status).toBe(302);
    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'click', botClass: 'known_bot' }),
    );
  });

  it('stamps botClass on the fallback click event from a crawler request', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_fallback_birtingur', 'slot_empty', 'tok123', ts);
    const res = await app.request(
      `/v1/click?s=slot_empty&c=cre_fallback_birtingur&t=tok123&ts=${ts}&sig=${sig}`,
      {
        headers: {
          'CF-IPCountry': 'IS',
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
      },
    );
    expect(res.status).toBe(302);
    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'click', botClass: 'known_bot' }),
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

    expect(vi.mocked(recordVisitorImpression)).toHaveBeenCalledWith('tok123', 'cmp_a');
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledWith('cmp_a', 1); // FLAT_CPM_ISK / 1000, rounded
  });

  it('stamps botClass on the impression event from a crawler request', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
    const res = await app.request(`/v1/impression?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'impression', botClass: 'known_bot' }),
    );
  });

  it('still returns the pixel and decrements budget when the logEvent write fails', async () => {
    // logEvent's own try/catch must not skip recordVisitorImpression/decrementBudget/
    // incrementPaceSpent below it — those used to run unconditionally when logEvent was
    // fire-and-forget, and a transient Redis failure on just the event write must not
    // silently skip the real-time budget gate.
    const ts = Date.now();
    const sig = createSignature('cre_a', 'slot_a', 'tok123', ts);
    vi.mocked(logEvent).mockRejectedValueOnce(new Error('redis down'));

    const res = await app.request(`/v1/impression?s=slot_a&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');
    expect(vi.mocked(recordVisitorImpression)).toHaveBeenCalledWith('tok123', 'cmp_a');
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledWith('cmp_a', 1);
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

  // `type=pageview` used to route straight past signature verification, so
  // anyone who knew a slot id — it sits in the publisher's page source — could
  // write unlimited pageviews for that slot and inflate the traffic and
  // fill-rate figures the publisher dashboard reports.
  it('ignores a pageview with no signature', async () => {
    const res = await app.request(
      '/v1/impression?s=slot_a&c=cre_fallback_birtingur&t=tok123&type=pageview',
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(logEvent)).not.toHaveBeenCalled();
  });

  it('ignores a pageview whose signature does not match', async () => {
    const ts = Date.now();
    const res = await app.request(
      `/v1/impression?s=slot_a&c=cre_fallback_birtingur&t=tok123&type=pageview&ts=${ts}&sig=deadbeef`,
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(logEvent)).not.toHaveBeenCalled();
  });

  // The slot load for the known-slot fallback (cre_fallback_*) is already
  // recorded by ad.ts at serve time — this legacy pixel firing again must NOT
  // write a second one. This is the double-count guard.
  it('returns the pixel for a correctly signed cre_fallback_birtingur pageview but logs nothing (already counted at serve time)', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_fallback_birtingur', 'slot_a', 'tok123', ts);
    const res = await app.request(
      `/v1/impression?s=slot_a&c=cre_fallback_birtingur&t=tok123&type=pageview&ts=${ts}&sig=${sig}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');
    expect(vi.mocked(logEvent)).not.toHaveBeenCalled();
  });

  // With the write gone for cre_fallback_*, a fresh and an already-claimed
  // signature both return an identical 200 gif — logEvent call counts can no
  // longer prove the replay guard runs. Assert directly on the Redis SET NX
  // seam (mockSet/mockSeenKeys) instead, so this stays a real pin on
  // claimSignatureOnce and would fail if that call were ever removed.
  it('still claims (rate-limits) a replayed signed cre_fallback_birtingur pageview even though nothing is logged', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_fallback_birtingur', 'slot_a', 'tok123', ts);
    const url = `/v1/impression?s=slot_a&c=cre_fallback_birtingur&t=tok123&type=pageview&ts=${ts}&sig=${sig}`;

    const first = await app.request(url);
    expect(first.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      `seen:pv:${sig}`,
      '1',
      expect.objectContaining({ nx: true }),
    );
    expect(mockSeenKeys.has(`seen:pv:${sig}`)).toBe(true);

    const callsBeforeReplay = mockSet.mock.calls.length;
    const second = await app.request(url);
    expect(second.status).toBe(200);
    // The claim is attempted again on replay (one more SET NX call), it just
    // returns null instead of 'OK' because the key is already present.
    expect(mockSet.mock.calls.length).toBe(callsBeforeReplay + 1);
    expect(vi.mocked(logEvent)).not.toHaveBeenCalled();
  });

  // Recovery path for the true cache-miss case: ad.ts's `!slot` branch served
  // cre_nocache and could not log the slot load itself (no publisherId at
  // serve time). If the cache has repopulated by the time this pixel fires,
  // this is the only remaining chance to record that slot load.
  it('recovers the slot load for a valid cre_nocache pixel once the cache has repopulated', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_nocache', 'slot_a', 'tok123', ts);
    const res = await app.request(
      `/v1/impression?s=slot_a&c=cre_nocache&t=tok123&type=pageview&ts=${ts}&sig=${sig}`,
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(logEvent)).toHaveBeenCalledTimes(1);
    // Wire type stays the ordinary 'pageview' (see AdEvent.type in
    // lib/analytics.ts) — creativeId: 'cre_nocache' is the marker that makes
    // this a slot load, not the wire type. This is deliberate: it means the
    // event is classified correctly by the aggregator regardless of which of
    // apps/serving or apps/api deploys first.
    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pageview',
        slotId: 'slot_a',
        publisherId: 'pub_a',
        creativeId: 'cre_nocache',
      }),
    );
  });

  it('stamps botClass on the cache-miss recovery slot-load event', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_nocache', 'slot_a', 'tok123', ts);
    const res = await app.request(
      `/v1/impression?s=slot_a&c=cre_nocache&t=tok123&type=pageview&ts=${ts}&sig=${sig}`,
      {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ creativeId: 'cre_nocache', botClass: 'known_bot' }),
    );
  });

  it('records nothing for a valid cre_nocache pixel while the cache is still cold', async () => {
    const ts = Date.now();
    const sig = createSignature('cre_nocache', 'slot_still_cold', 'tok123', ts);
    const res = await app.request(
      `/v1/impression?s=slot_still_cold&c=cre_nocache&t=tok123&type=pageview&ts=${ts}&sig=${sig}`,
    );
    expect(res.status).toBe(200);
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
