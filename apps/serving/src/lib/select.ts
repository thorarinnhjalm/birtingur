import type { CachedCreative, SlotCacheEntry } from '@ada/shared';

export interface SelectionContext {
  country: string;
  consent: 'full' | 'none';
  visitorImpressionsToday: Record<string, number>;
  regions?: string[];
}

function isEligible(c: CachedCreative, ctx: SelectionContext, now: number): boolean {
  if (c.budgetExhausted) return false;
  if (now < c.validFrom || now > c.validTo) return false;
  if (ctx.consent === 'full') {
    if (c.geoCountries && c.geoCountries.length > 0 && !c.geoCountries.includes(ctx.country))
      return false;
    const seen = ctx.visitorImpressionsToday[c.creativeId] ?? 0;
    if (seen >= c.frequencyCapPerDay) return false;
  }
  // Region targeting (fail-open): only filter when the creative restricts regions, the visitor
  // regions are known, and 'all' is not present.
  const regions = c.geoRegions ?? [];
  const visitorRegions = ctx.regions ?? ['unknown'];
  if (regions.length > 0 && !regions.includes('all') && !visitorRegions.includes('unknown')) {
    if (!regions.some((r) => visitorRegions.includes(r))) return false;
  }
  return true;
}

function weightedRandom(items: CachedCreative[]): CachedCreative {
  const total = items.reduce((acc, c) => acc + Math.max(c.weight, 0), 0);
  if (total <= 0) return items[0]!;
  let r = Math.random() * total;
  for (const c of items) {
    r -= Math.max(c.weight, 0);
    if (r <= 0) return c;
  }
  return items[items.length - 1]!;
}

export function selectCreative(slot: SlotCacheEntry, ctx: SelectionContext): CachedCreative | null {
  const now = Date.now();
  const eligible = slot.activeCreatives.filter((c) => isEligible(c, ctx, now));
  if (eligible.length === 0) return null;

  const slotPurchased = eligible.filter((c) => c.priority === 'slot_purchased');
  if (slotPurchased.length > 0) return weightedRandom(slotPurchased);

  return weightedRandom(eligible);
}
