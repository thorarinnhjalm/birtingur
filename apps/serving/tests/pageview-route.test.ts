import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';
import { createSignature } from '../src/lib/crypto';
import { PAGEVIEW_CREATIVE_ID } from '../src/lib/analytics';
import type { AdEvent } from '../src/lib/analytics';

const mockSeenKeys = new Set<string>();

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, _val: string, options?: { nx?: boolean; ex?: number }) => {
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
  slotId: 'slot_1',
  publisherId: 'pub_1',
  sizes: [{ width: 728, height: 90 }],
  pricing: { mode: 'cpm', cpmIsk: 1000 },
  activeCreatives: [],
  blockedCategories: [],
  refreshedAt: Date.now(),
};

vi.mock('../src/lib/cache', () => ({
  getSlotCache: vi.fn(async (id: string) => (id === 'slot_1' ? mockSlot : null)),
  pushSlotCache: vi.fn(),
  invalidateSlot: vi.fn(),
}));

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
  };
});

import app from '../src/index';

describe('GET /v1/pageview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeenKeys.clear();
    logged = [];
  });

  it('records exactly one pageview for a validly signed pixel', async () => {
    const ts = Date.now();
    const sig = createSignature(PAGEVIEW_CREATIVE_ID, 'slot_1', 'vis_1', ts);
    const res = await app.request(`/v1/pageview?s=slot_1&t=vis_1&ts=${ts}&sig=${sig}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/gif');
    expect(loggedEvents().filter((e) => e.type === 'pageview')).toHaveLength(1);
    expect(loggedEvents()[0]).toMatchObject({
      type: 'pageview',
      slotId: 'slot_1',
      publisherId: 'pub_1',
      visitorToken: 'vis_1',
    });
  });

  it('ignores a replay of the same signature', async () => {
    const ts = Date.now();
    const sig = createSignature(PAGEVIEW_CREATIVE_ID, 'slot_1', 'vis_1', ts);
    const url = `/v1/pageview?s=slot_1&t=vis_1&ts=${ts}&sig=${sig}`;
    const first = await app.request(url);
    const second = await app.request(url);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(loggedEvents().filter((e) => e.type === 'pageview')).toHaveLength(1);
  });

  it('records nothing for a missing or wrong signature', async () => {
    const ts = Date.now();
    const resMissing = await app.request(`/v1/pageview?s=slot_1&t=vis_1&ts=${ts}`);
    expect(resMissing.status).toBe(200);
    expect(resMissing.headers.get('content-type')).toBe('image/gif');

    const resWrong = await app.request(`/v1/pageview?s=slot_1&t=vis_1&ts=${ts}&sig=deadbeef`);
    expect(resWrong.status).toBe(200);
    expect(resWrong.headers.get('content-type')).toBe('image/gif');

    expect(loggedEvents()).toHaveLength(0);
  });

  it('records nothing when the slot cache has expired (publisher unknown)', async () => {
    const ts = Date.now();
    const sig = createSignature(PAGEVIEW_CREATIVE_ID, 'slot_gone', 'vis_1', ts);
    const res = await app.request(`/v1/pageview?s=slot_gone&t=vis_1&ts=${ts}&sig=${sig}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/gif');
    expect(loggedEvents()).toHaveLength(0);
  });

  it('forging &type=pageview-style query params cannot substitute for a valid signature', async () => {
    // There is no `type` param on this route at all — the signature itself is
    // the only thing that authorizes a write. A missing/forged sig is rejected
    // regardless of any other query params supplied.
    const res = await app.request('/v1/pageview?s=slot_1&t=vis_1&ts=1&sig=&extra=pageview');
    expect(res.status).toBe(200);
    expect(loggedEvents()).toHaveLength(0);
  });

  it('returns the pixel even when the slot param is missing', async () => {
    const res = await app.request('/v1/pageview');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/gif');
    expect(loggedEvents()).toHaveLength(0);
  });
});
