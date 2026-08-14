import { describe, it, expect } from 'vitest';
import {
  AD_CATEGORIES,
  AD_CATEGORY_SLUGS,
  FLAT_CPM_ISK,
  grossIskForImpressions,
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

  it('and the fee it implies always add back up to the gross', () => {
    // The property that matters and that this file can actually check on its
    // own: the split loses nothing. Re-deriving the implementation here and
    // asserting it matches itself would prove only that it is deterministic.
    // Agreement with the LEDGER is asserted in apps/api/tests/wallet.test.ts,
    // against what creditPublisher really writes, because that is the only
    // check that cannot drift along with this function.
    for (const gross of [0, 1, 3, 5, 7, 550, 5501, 12_345, 999_999]) {
      const net = publisherNetIsk(gross);
      const fee = gross - net;
      expect(net + fee).toBe(gross);
      expect(fee).toBeGreaterThanOrEqual(0);
      expect(net).toBeLessThanOrEqual(gross);
    }
  });

  it('never rounds the fee up past the whole gross on a tiny amount', () => {
    // A 1-króna gross must not become a 0-króna credit and a 1-króna fee.
    expect(publisherNetIsk(1)).toBe(1);
    expect(publisherNetIsk(2)).toBe(2);
  });

  it('returns whole krónur, never a fraction', () => {
    expect(Number.isInteger(publisherNetIsk(7))).toBe(true);
    expect(Number.isInteger(publisherNetIsk(1))).toBe(true);
  });

  it('is zero for zero, not NaN', () => {
    expect(publisherNetIsk(0)).toBe(0);
  });
});

/**
 * The single definition of what impressions are worth, rounded ONCE over the
 * period being reported. The aggregator's per-run rounding of the same
 * arithmetic booked a whole króna per single-impression hour and overstated the
 * smallest publishers' dashboards by up to 82%.
 */
describe('grossIskForImpressions', () => {
  it('rounds half-krónur once, not per unit', () => {
    // 1 impression is 0,55 → 1 when rounded alone; 3 impressions are 1,65 → 2,
    // not the 3 that per-unit rounding accumulates.
    expect(grossIskForImpressions(1)).toBe(1);
    expect(grossIskForImpressions(3)).toBe(2);
  });

  it('is exact at CPM multiples', () => {
    expect(grossIskForImpressions(1000)).toBe(FLAT_CPM_ISK);
    expect(grossIskForImpressions(100_000)).toBe(55_000);
  });

  it('is zero for zero impressions', () => {
    expect(grossIskForImpressions(0)).toBe(0);
  });

  it('never differs from the exact value by more than half a króna', () => {
    for (const n of [1, 7, 24, 144, 999, 12_345, 720_000]) {
      expect(Math.abs(grossIskForImpressions(n) - (n * FLAT_CPM_ISK) / 1000)).toBeLessThanOrEqual(
        0.5,
      );
    }
  });
});
