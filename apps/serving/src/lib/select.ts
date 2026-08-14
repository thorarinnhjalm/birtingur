import { BANDIT_EPSILON, BANDIT_COLD_START_IMPRESSIONS, BANDIT_MIN_CLICKS } from '@ada/shared';
import type { CachedCreative, SlotCacheEntry } from '@ada/shared';

export interface SelectionContext {
  country: string;
  consent: 'full' | 'none';
  /**
   * Impressions this visitor has already been shown today, keyed by CAMPAIGN id.
   *
   * Keyed by campaign rather than by creative because a campaign may now place
   * several variants in one slot. Counting per creative would multiply an
   * advertiser's daily exposure by its variant count — three variants against a
   * competitor's one would mean 9 impressions a day to the same visitor instead
   * of 3, at the same flat CPM, and would take a growing share of that visitor's
   * later impressions as single-variant competitors hit their cap first. While a
   * campaign could only ever contribute one creative the two keyings were
   * equivalent, which is why this used to be per creative.
   */
  visitorImpressionsToday: Record<string, number>;
  regions?: string[];
  /**
   * Randomness source. Defaults to Math.random; tests inject a seeded generator
   * so a thousand-draw distribution can be asserted instead of hoped for.
   * Production never passes this.
   */
  rng?: () => number;
}

function isEligible(c: CachedCreative, ctx: SelectionContext, now: number): boolean {
  if (c.budgetExhausted) return false;
  if (now < c.validFrom || now > c.validTo) return false;
  if (ctx.consent === 'full') {
    if (c.geoCountries && c.geoCountries.length > 0 && !c.geoCountries.includes(ctx.country))
      return false;
    const seen = ctx.visitorImpressionsToday[c.campaignId] ?? 0;
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

function weightedRandom<T>(items: T[], weightOf: (item: T) => number, rng: () => number): T {
  // Short-circuit before touching rng so a single candidate does not consume a
  // draw — that keeps the random stream identical whether or not a slot happens
  // to carry competition, which matters for reproducible tests.
  if (items.length === 1) return items[0]!;
  const total = items.reduce((acc, i) => acc + Math.max(weightOf(i), 0), 0);
  if (total <= 0) return items[0]!;
  let r = rng() * total;
  for (const i of items) {
    r -= Math.max(weightOf(i), 0);
    if (r <= 0) return i;
  }
  return items[items.length - 1]!;
}

interface CampaignGroup {
  weight: number;
  creatives: CachedCreative[];
}

function groupByCampaign(creatives: CachedCreative[]): CampaignGroup[] {
  const byCampaign = new Map<string, CampaignGroup>();
  for (const c of creatives) {
    const group = byCampaign.get(c.campaignId);
    if (group) {
      group.creatives.push(c);
      // MAX, deliberately not SUM. Every advertiser pays the same flat CPM, so a
      // campaign must not be able to buy a larger share of a slot by uploading
      // more image variants. Summing would hand a three-variant campaign three
      // times the delivery of a one-variant campaign at the same price.
      group.weight = Math.max(group.weight, c.weight);
    } else {
      byCampaign.set(c.campaignId, { weight: c.weight, creatives: [c] });
    }
  }
  return Array.from(byCampaign.values());
}

function measuredCtr(c: CachedCreative): number {
  const stats = c.ctr;
  // No counters, or clicks recorded against zero impressions (a click can land
  // before its impression pixel fires): treat as no evidence rather than
  // dividing by zero and letting an Infinity CTR win every draw forever.
  if (!stats || stats.imp <= 0) return 0;
  return stats.clk / stats.imp;
}

function isCold(c: CachedCreative): boolean {
  return (c.ctr?.imp ?? 0) < BANDIT_COLD_START_IMPRESSIONS;
}

/**
 * Epsilon-greedy pick between the creative variants OF ONE CAMPAIGN.
 *
 * Scoped to a single campaign on purpose. Running it across the whole eligible
 * pool would let the prettiest advertiser's ad starve everyone else's at an
 * identical flat CPM, breaking both pacing and the delivery promise — that is an
 * allocation decision, not a creative-rotation one.
 */
function selectVariant(creatives: CachedCreative[], rng: () => number): CachedCreative {
  if (creatives.length === 1) return creatives[0]!;

  // Cold start: rotate evenly until EVERY variant has enough evidence. Exploiting
  // earlier buries a variant that merely got unlucky in its first few draws.
  if (creatives.some(isCold)) return weightedRandom(creatives, (c) => c.weight, rng);

  // Evidence gate. A measured CTR difference built on a handful of clicks is
  // noise, and acting on it is worse than not acting: the winner gets
  // 1 - BANDIT_EPSILON of the traffic, which makes it likelier to catch the next
  // click too, so a coin-flip lead becomes permanent. See BANDIT_MIN_CLICKS.
  const totalClicks = creatives.reduce((acc, c) => acc + Math.max(c.ctr?.clk ?? 0, 0), 0);
  if (totalClicks < BANDIT_MIN_CLICKS) return weightedRandom(creatives, (c) => c.weight, rng);

  const bestCtr = Math.max(...creatives.map(measuredCtr));
  // Ties are resolved at random, NEVER by position. Falling back to creatives[0]
  // hands the first entry in the campaign's creativeIds a permanent 80% share
  // whenever the variants are indistinguishable, which at display CTRs is most
  // of the time.
  const best = weightedRandom(
    creatives.filter((c) => measuredCtr(c) === bestCtr),
    () => 1,
    rng,
  );

  if (rng() >= BANDIT_EPSILON) return best;

  const rest = creatives.filter((c) => c.creativeId !== best.creativeId);
  if (rest.length === 0) return best;
  return rest[Math.min(rest.length - 1, Math.floor(rng() * rest.length))]!;
}

export function selectCreative(slot: SlotCacheEntry, ctx: SelectionContext): CachedCreative | null {
  const rng = ctx.rng ?? Math.random;
  const now = Date.now();
  const eligible = slot.activeCreatives.filter((c) => isEligible(c, ctx, now));
  if (eligible.length === 0) return null;

  const slotPurchased = eligible.filter((c) => c.priority === 'slot_purchased');
  const pool = slotPurchased.length > 0 ? slotPurchased : eligible;

  // Two stages: which campaign gets the impression (unchanged economics — one
  // draw per campaign, not per creative), then which of that campaign's variants
  // renders (the bandit).
  const group = weightedRandom(groupByCampaign(pool), (g) => g.weight, rng);
  return selectVariant(group.creatives, rng);
}
