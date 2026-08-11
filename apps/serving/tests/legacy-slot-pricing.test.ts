import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '@ada/shared';
import { FLAT_CPM_ISK } from '@ada/shared';
import { createSignature } from '../src/lib/crypto';

/**
 * A slot whose stored pricing is the legacy `slot` (fixed price per period)
 * mode used to skip serving's real-time budget decrement entirely, because
 * that decrement was gated on `pricing.mode === 'cpm'`. The accrual cron
 * charged the campaign for those impressions anyway, so such a slot could
 * serve past a campaign's budget until the next 15-minute run — the one
 * overspend path in serving, against an otherwise fail-closed budget gate.
 *
 * No new slot can be created in that mode any more, but production may still
 * hold some, so the serving side has to charge them like everything else.
 */

const mockSeenKeys = new Set<string>();
const mockIncrStore = new Map<string, number>();

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, _v: string, o?: { nx?: boolean }) => {
      if (o?.nx) {
        if (mockSeenKeys.has(key)) return null;
        mockSeenKeys.add(key);
        return 'OK';
      }
      return 'OK';
    }),
    incrby: vi.fn(async () => 1),
    incr: vi.fn(async (key: string) => {
      const next = (mockIncrStore.get(key) ?? 0) + 1;
      mockIncrStore.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => true),
  }),
}));

function slotWithPricing(pricing: SlotCacheEntry['pricing']): SlotCacheEntry {
  return {
    slotId: 'slot_legacy',
    publisherId: 'pub_a',
    sizes: [{ width: 728, height: 90 }],
    pricing,
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
        validTo: Date.now() + 60_000,
        priority: 'cpm',
      },
    ],
    blockedCategories: [],
    refreshedAt: Date.now(),
  };
}

let currentSlot: SlotCacheEntry = slotWithPricing({ mode: 'cpm', cpmIsk: FLAT_CPM_ISK });

vi.mock('../src/lib/cache', () => ({
  getSlotCache: vi.fn(async (id: string) => (id === 'slot_legacy' ? currentSlot : null)),
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
    incrementPaceSpent: vi.fn(),
  };
});

import { decrementBudget, incrementPaceSpent } from '../src/lib/analytics';
import app from '../src/index';

async function fireImpression() {
  const ts = Date.now();
  const sig = createSignature('cre_a', 'slot_legacy', 'tok123', ts);
  return app.request(`/v1/impression?s=slot_legacy&c=cre_a&t=tok123&ts=${ts}&sig=${sig}`);
}

const EXPECTED_COST = Math.round(FLAT_CPM_ISK / 1000);

describe('budget decrement is independent of the slot’s stored pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeenKeys.clear();
    mockIncrStore.clear();
  });

  it('charges a legacy slot-priced slot instead of serving it for free', async () => {
    currentSlot = slotWithPricing({ mode: 'slot', slotPriceIsk: 25_000, slotPeriodDays: 30 });

    const res = await fireImpression();

    expect(res.status).toBe(200);
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledWith('cmp_a', EXPECTED_COST);
    expect(vi.mocked(incrementPaceSpent)).toHaveBeenCalledWith('cmp_a', EXPECTED_COST);
  });

  it('charges the flat CPM, not whatever cpmIsk a stale cache entry carries', async () => {
    currentSlot = slotWithPricing({ mode: 'cpm', cpmIsk: 9_000 });

    await fireImpression();

    // 9000/1000 would be 9 ISK — but accrual books FLAT_CPM_ISK, so the
    // real-time gate has to agree or the two drift apart.
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledWith('cmp_a', EXPECTED_COST);
  });

  it('still charges a normal flat-CPM slot exactly once', async () => {
    currentSlot = slotWithPricing({ mode: 'cpm', cpmIsk: FLAT_CPM_ISK });

    await fireImpression();

    expect(vi.mocked(decrementBudget)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(decrementBudget)).toHaveBeenCalledWith('cmp_a', EXPECTED_COST);
  });
});
