import { describe, it, expect } from 'vitest';
import { selectCreative } from '../src/lib/select';
import type { CachedCreative, SlotCacheEntry } from '@ada/shared';

function makeCreative(over: Partial<CachedCreative> = {}): CachedCreative {
  return {
    creativeId: 'c1',
    campaignId: 'cmp1',
    imageUrl: 'https://example/img.png',
    clickUrl: 'https://example/click',
    width: 728,
    height: 90,
    weight: 1,
    frequencyCapPerDay: 3,
    budgetExhausted: false,
    validFrom: Date.now() - 60_000,
    validTo: Date.now() + 60_000,
    priority: 'cpm',
    ...over,
  };
}

function makeSlot(creatives: CachedCreative[]): SlotCacheEntry {
  return {
    slotId: 's1',
    publisherId: 'pub1',
    sizes: [{ width: 728, height: 90 }],
    pricing: { mode: 'cpm', cpmIsk: 1000 },
    activeCreatives: creatives,
    blockedCategories: [],
    refreshedAt: Date.now(),
  };
}

describe('selectCreative', () => {
  it('returns null when no creatives', () => {
    expect(
      selectCreative(makeSlot([]), { country: 'IS', consent: 'full', visitorImpressionsToday: {} }),
    ).toBe(null);
  });

  it('skips expired creatives', () => {
    const expired = makeCreative({ validTo: Date.now() - 1000 });
    expect(
      selectCreative(makeSlot([expired]), {
        country: 'IS',
        consent: 'full',
        visitorImpressionsToday: {},
      }),
    ).toBe(null);
  });

  it('skips budget-exhausted creatives', () => {
    const dry = makeCreative({ budgetExhausted: true });
    expect(
      selectCreative(makeSlot([dry]), {
        country: 'IS',
        consent: 'full',
        visitorImpressionsToday: {},
      }),
    ).toBe(null);
  });

  it('respects geo with consent=full', () => {
    const isOnly = makeCreative({ geoCountries: ['IS'] });
    const fr = makeCreative({ creativeId: 'c2', geoCountries: ['FR'] });
    const slot = makeSlot([isOnly, fr]);
    const got = selectCreative(slot, {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: {},
    });
    expect(got?.creativeId).toBe('c1');
  });

  it('ignores geo when consent=none', () => {
    const isOnly = makeCreative({ geoCountries: ['IS'] });
    const slot = makeSlot([isOnly]);
    const got = selectCreative(slot, {
      country: 'FR',
      consent: 'none',
      visitorImpressionsToday: {},
    });
    expect(got?.creativeId).toBe('c1');
  });

  it('prioritises slot_purchased over cpm', () => {
    const cpm = makeCreative({ creativeId: 'cpm', priority: 'cpm' });
    const slot = makeCreative({ creativeId: 'slot', priority: 'slot_purchased' });
    const got = selectCreative(makeSlot([cpm, slot]), {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: {},
    });
    expect(got?.creativeId).toBe('slot');
  });

  // Keyed by campaign id, not creative id — a campaign's variants share one
  // frequency budget. See SelectionContext.visitorImpressionsToday.
  it('respects frequency cap with consent=full', () => {
    const capped = makeCreative({ frequencyCapPerDay: 3 });
    const slot = makeSlot([capped]);
    expect(
      selectCreative(slot, {
        country: 'IS',
        consent: 'full',
        visitorImpressionsToday: { cmp1: 3 },
      }),
    ).toBe(null);
  });

  it('respects geoRegions', () => {
    const capitalOnly = makeCreative({ geoRegions: ['capital'] });
    const countrysideOnly = makeCreative({ creativeId: 'c2', geoRegions: ['countryside'] });
    const akureyriOnly = makeCreative({ creativeId: 'c3', geoRegions: ['akureyri'] });

    // 1. Capital visitor selects only capitalOnly
    let slot = makeSlot([capitalOnly, countrysideOnly, akureyriOnly]);
    let got = selectCreative(slot, {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: {},
      regions: ['reykjavik', 'capital'],
    });
    expect(got?.creativeId).toBe('c1');

    // 2. Countryside visitor selects countrysideOnly
    got = selectCreative(slot, {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: {},
      regions: ['selfoss', 'countryside'],
    });
    expect(got?.creativeId).toBe('c2');

    // 3. Akureyri visitor selects akureyriOnly OR countrysideOnly (since they belong to both countryside and akureyri)
    got = selectCreative(slot, {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: {},
      regions: ['akureyri', 'countryside'],
    });
    expect(['c2', 'c3']).toContain(got?.creativeId);

    // 4. Unknown visitor (fail-open) selects either/any
    got = selectCreative(slot, {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: {},
      regions: ['unknown'],
    });
    expect(got).not.toBeNull();
  });
});
