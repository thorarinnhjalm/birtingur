import { describe, it, expect } from 'vitest';
import {
  AD_CATEGORIES,
  AD_CATEGORY_SLUGS,
  DEFAULT_PLATFORM_FEE_PERCENT,
  publisherNetIsk,
} from '../src/constants';

describe('AD_CATEGORIES', () => {
  it('exposes food category for the canonical mayo use-case', () => {
    expect(AD_CATEGORY_SLUGS).toContain('matur');
  });
  it('every category has a slug and an Icelandic label', () => {
    for (const c of AD_CATEGORIES) {
      expect(c.slug).toMatch(/^[a-z_]+$/);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
  it('slugs are unique', () => {
    expect(new Set(AD_CATEGORY_SLUGS).size).toBe(AD_CATEGORY_SLUGS.length);
  });
});

/**
 * Publisher net earnings had eight independent derivations across the product —
 * `Math.round(spendIsk * 0.8)` in some places, `spendIsk * (1 - FEE/100)` in
 * others — plus two external surfaces that showed the GROSS figure under the
 * word "tekjur": the embeddable stats widget and MCP `check_slot_delivery`.
 * A publisher reading their own embedded widget saw 25% more than the dashboard
 * told them, on a page they had put on their own site.
 */
describe('publisherNetIsk', () => {
  it('takes the platform fee off a gross figure', () => {
    expect(publisherNetIsk(5500)).toBe(4400);
  });

  it('agrees with how the ledger splits the same gross', () => {
    // wallet.ts credits `gross - round(gross * fee)`. The two must not disagree
    // by a króna, or the dashboard and the payout differ for the same money.
    const fee = (g: number) => Math.round(g * (DEFAULT_PLATFORM_FEE_PERCENT / 100));
    for (const gross of [0, 1, 3, 7, 550, 5501, 12_345, 999_999]) {
      expect(publisherNetIsk(gross)).toBe(gross - fee(gross));
    }
  });

  it('returns whole krónur, never a fraction', () => {
    expect(Number.isInteger(publisherNetIsk(7))).toBe(true);
    expect(Number.isInteger(publisherNetIsk(1))).toBe(true);
  });

  it('is zero for zero, not NaN', () => {
    expect(publisherNetIsk(0)).toBe(0);
  });
});
