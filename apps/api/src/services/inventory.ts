import {
  COLLECTIONS,
  publisherConverter,
  campaignConverter,
  slotConverter,
} from '@ada/shared/firestore';
import { AD_CATEGORY_SLUGS, FLAT_CPM_ISK, IAB_STANDARD_SIZES } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { getRedis, isRedisConfigured } from '../lib/redis.js';

export interface CategoryInventory {
  category: string;
  avgDailyImpressions: number;
  committedDailyImpressions: number;
  availableDailyImpressions: number;
}

export interface CategorySizeForecast {
  width: number;
  height: number;
  /** Number of ACTIVE slots (across active publishers in the requested
   * categories) that declare this size. */
  slotCount: number;
  /** This size's share (0..1, rounded to 4 decimals so a small-but-nonzero
   * share isn't indistinguishable from a true zero) of the summed
   * daily-impression forecast across every size returned — sums to ~1
   * across the whole result array. `null` when the whole 7-day forecast
   * window is empty (no impression history yet) — there is no meaningful
   * share to report, and reporting `0` for every size would misleadingly
   * read as "none of these sizes get any traffic" (see the wizard's
   * "um 0%" bug, creative-wizard 2026-07-27 plan follow-up). Callers should
   * fall back to showing only `slotCount` when this is `null`. */
  forecastShare: number | null;
}

function lastNDateKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(d.toISOString().split('T')[0]!.replace(/-/g, ''));
  }
  return keys;
}

/**
 * Campaigns whose demand counts against available inventory: live, or awaiting
 * an approval that can land at any moment and start spending immediately.
 *
 * Module-level so the per-category and combined functions cannot drift apart on
 * it. Both re-check it in their loops as well, redundantly with the Firestore
 * query, so the logic stays self-contained for unit-test mocks that ignore
 * `.where()`.
 */
const COMMITTED_STATUSES = ['active', 'pending_approval'] as const;

/**
 * A campaign's daily impression commitment: its remaining budget spread over
 * the days of flight it has left, converted at the flat CPM.
 *
 * The floor is `FLAT_CPM_ISK / 1000`, exact rather than rounded to 1 — that is
 * the real cost of one impression and it is what serving now charges (see
 * routes/impression.ts). Shared so the two callers cannot answer the question
 * differently, which they did: a campaign with nothing left committed 2
 * impressions a day through one and 1 through the other.
 */
function campaignDailyImpressions(cmp: {
  budget: { remainingIsk: number };
  schedule: { startsAt: Date; endsAt: Date };
}): number {
  const now = Date.now();
  const flightStartMs = Math.max(now, cmp.schedule.startsAt.getTime());
  const daysLeft = Math.max(
    1,
    Math.ceil((cmp.schedule.endsAt.getTime() - flightStartMs) / 86_400_000),
  );
  const perImpression = FLAT_CPM_ISK / 1000;
  const dailyBudgetIsk = Math.max(perImpression, Math.round(cmp.budget.remainingIsk / daysLeft));
  return Math.round((dailyBudgetIsk / FLAT_CPM_ISK) * 1000);
}

export async function getCategoryInventory(): Promise<CategoryInventory[]> {
  const pubSnap = await db
    .collection(COLLECTIONS.publishers)
    .where('status', '==', 'active')
    .withConverter(publisherConverter)
    .get();

  const dateKeys = lastNDateKeys(7);
  const totalByCategory = new Map<string, number>();

  for (const pubDoc of pubSnap.docs) {
    const pub = pubDoc.data();
    let pubTotal = 0;
    for (const dk of dateKeys) {
      const statDoc = await db.doc(`${COLLECTIONS.stats}/publishers/${pub.id}/${dk}`).get();
      pubTotal += (statDoc.data()?.impressions ?? 0) as number;
    }
    const pubAvg = Math.round(pubTotal / dateKeys.length);
    for (const cat of pub.categories) {
      totalByCategory.set(cat, (totalByCategory.get(cat) ?? 0) + pubAvg);
    }
  }

  // Committed: daily allowance of cpm_capped campaigns that are live or awaiting approval
  // (approval can land any moment and spend starts immediately), in impressions, per
  // category. Budget is spread over the actual flight window — a future startsAt must not
  // dilute the daily commitment with pre-flight days.
  const cmpSnap = await db
    .collection(COLLECTIONS.campaigns)
    .where('status', 'in', COMMITTED_STATUSES)
    .withConverter(campaignConverter)
    .get();
  const committedByCategory = new Map<string, number>();
  const now = Date.now();
  for (const doc of cmpSnap.docs) {
    const cmp = doc.data();
    // Redundant with the query filter; kept so the logic is self-contained for
    // unit-test mocks that ignore .where().
    if (!(COMMITTED_STATUSES as readonly string[]).includes(cmp.status)) continue;
    if (cmp.budget.mode !== 'cpm_capped') continue;
    if (cmp.schedule.endsAt.getTime() <= now) continue;
    const dailyImpressions = campaignDailyImpressions(cmp);
    for (const cat of cmp.targeting.categories) {
      committedByCategory.set(cat, (committedByCategory.get(cat) ?? 0) + dailyImpressions);
    }
  }

  return AD_CATEGORY_SLUGS.map((category) => {
    const gross = totalByCategory.get(category) ?? 0;
    const committed = committedByCategory.get(category) ?? 0;
    return {
      category,
      avgDailyImpressions: gross,
      committedDailyImpressions: committed,
      availableDailyImpressions: Math.max(0, gross - committed),
    };
  });
}

/**
 * Availability across a SELECTION of categories, with each publisher and each
 * competing campaign counted once.
 *
 * `getCategoryInventory` above reports a publisher's whole daily volume under
 * every category it declares, which is right — each row answers "what could I
 * get if I bought this category". It is not additive. Summing the rows for a
 * multi-category selection counts one publisher once per category it happens to
 * be in, so a single 1.000-impression publisher in two categories reads as
 * 2.000, and an oversell warning built on that number stays silent for a
 * campaign that can never be delivered.
 *
 * The deduplication has to happen where the publisher and campaign identities
 * still exist, so it happens here rather than in the caller. An empty selection
 * returns zeroes, never the whole network.
 */
async function computeCombinedCategoryInventory(
  categories: string[],
): Promise<Omit<CategoryInventory, 'category'>> {
  const wanted = new Set(categories);
  if (wanted.size === 0) {
    return { avgDailyImpressions: 0, committedDailyImpressions: 0, availableDailyImpressions: 0 };
  }

  const pubSnap = await db
    .collection(COLLECTIONS.publishers)
    .where('status', '==', 'active')
    .withConverter(publisherConverter)
    .get();

  const dateKeys = lastNDateKeys(7);
  // Kept, not just summed: a campaign can only consume impressions from
  // publishers whose categories it actually targets, and capping its committed
  // demand needs to know which those are (see the campaign loop below).
  const reachable: Array<{ categories: string[]; avgDaily: number }> = [];
  let gross = 0;

  for (const pubDoc of pubSnap.docs) {
    const pub = pubDoc.data();
    if (!pub.categories.some((cat: string) => wanted.has(cat))) continue;
    let pubTotal = 0;
    for (const dk of dateKeys) {
      const statDoc = await db.doc(`${COLLECTIONS.stats}/publishers/${pub.id}/${dk}`).get();
      pubTotal += (statDoc.data()?.impressions ?? 0) as number;
    }
    const avgDaily = Math.round(pubTotal / dateKeys.length);
    // Once per publisher, however many of the selected categories it is in.
    reachable.push({ categories: pub.categories, avgDaily });
    gross += avgDaily;
  }

  const cmpSnap = await db
    .collection(COLLECTIONS.campaigns)
    .where('status', 'in', [...COMMITTED_STATUSES])
    .withConverter(campaignConverter)
    .get();

  let committed = 0;
  for (const cmpDoc of cmpSnap.docs) {
    const cmp = cmpDoc.data();
    if (cmp.budget.mode !== 'cpm_capped') continue;
    // Kept for the unit-test mocks that ignore `.where()`, exactly as the
    // per-category function above does — without it a paused campaign counts as
    // live demand in tests while production is protected by the query.
    if (!COMMITTED_STATUSES.includes(cmp.status as (typeof COMMITTED_STATUSES)[number])) continue;
    if (!cmp.targeting.categories.some((cat: string) => wanted.has(cat))) continue;
    if (cmp.schedule.endsAt.getTime() <= Date.now()) continue;

    const dailyImpressions = campaignDailyImpressions(cmp);

    // Capped at what this campaign can physically take out of the selection.
    // Without the cap, one campaign oversubscribed in a thin category drains
    // the whole combined figure: a publisher doing 5.000/day in `matur` plus a
    // 50/day publisher in `bilar` with a vastly overcommitted campaign returned
    // 0 available for both, and the buy flow warned against a campaign that
    // would have delivered fine. The per-category function never had this
    // problem because it clamps inside each category.
    const reach = reachable
      .filter((p) => p.categories.some((cat) => cmp.targeting.categories.includes(cat)))
      .reduce((sum, p) => sum + p.avgDaily, 0);

    committed += Math.min(dailyImpressions, reach);
  }

  return {
    avgDailyImpressions: gross,
    committedDailyImpressions: committed,
    availableDailyImpressions: Math.max(0, gross - committed),
  };
}

const COMBINED_INVENTORY_CACHE_TTL_SECONDS = 600;

/**
 * Read-through Redis cache in front of `computeCombinedCategoryInventory`, for
 * exactly the reason `getCategorySizeForecast` below has one: this backs a
 * user-facing buy-flow step and the computation is an N+1 (one Firestore read
 * per active publisher, plus seven more each for the trailing stats window)
 * that would otherwise run on every category the advertiser clicks, and twice
 * per agent call through MCP `list_categories`.
 *
 * Same "skip entirely when unconfigured" pattern as the size forecast: this is a
 * plain cache, not a gate, so an unconfigured Redis just means computing live.
 */
export async function getCombinedCategoryInventory(
  categories: string[],
): Promise<Omit<CategoryInventory, 'category'>> {
  const cacheKey = `combined-inventory:${[...categories].sort().join(',')}`;

  if (isRedisConfigured()) {
    try {
      const cached = await getRedis().get<Omit<CategoryInventory, 'category'>>(cacheKey);
      if (cached) return cached;
    } catch (err) {
      console.error(
        'getCombinedCategoryInventory cache read error (falling back to live compute):',
        err,
      );
    }
  }

  const result = await computeCombinedCategoryInventory(categories);

  if (isRedisConfigured()) {
    try {
      await getRedis().set(cacheKey, result, { ex: COMBINED_INVENTORY_CACHE_TTL_SECONDS });
    } catch (err) {
      console.error('getCombinedCategoryInventory cache write error (ignored):', err);
    }
  }

  return result;
}

/** Sizes the render endpoint (`/v1/creatives/generate/render`, see
 * `services/ai-creative/render-variant.ts`'s `VALID_IAB_SIZE_KEYS`) will
 * actually accept. A publisher's `slots.sizes` is a free-form 1..2000 field
 * (`seed.ts` itself seeds a 970x250 slot) — this endpoint is the wizard's
 * "which sizes will I get" step, so surfacing a non-IAB size here would walk
 * the advertiser straight into a 400 at the render step with no way forward.
 * This is the server-side source of truth for that filter; `CreativeGenerator.tsx`
 * additionally intersects defensively on the client. */
const IAB_SIZE_KEYS = new Set(IAB_STANDARD_SIZES.map((s) => `${s.width}x${s.height}`));

const SIZE_FORECAST_CACHE_TTL_SECONDS = 600;

function sizeForecastCacheKey(categories: string[]): string {
  return `sizes-forecast:${[...categories].sort().join(',')}`;
}

/**
 * Read-through Redis cache in front of `computeCategorySizeForecast` (Fix 7,
 * follow-up review): this backs a user-facing wizard step and was an
 * uncached N+1 (one Firestore read per active publisher, plus 7 more per
 * publisher for the trailing stats window) on every category-selection
 * change. Same "skip entirely when unconfigured" pattern as
 * `lib/rate-limit.ts` — this is a plain cache, not a security gate, so an
 * unconfigured Redis (e.g. the emulator-only API test suite per CLAUDE.md)
 * just means always computing live rather than failing closed.
 */
export async function getCategorySizeForecast(
  categories: string[],
): Promise<CategorySizeForecast[]> {
  const cacheKey = sizeForecastCacheKey(categories);

  if (isRedisConfigured()) {
    try {
      const cached = await getRedis().get<CategorySizeForecast[]>(cacheKey);
      if (cached) return cached;
    } catch (err) {
      console.error(
        'getCategorySizeForecast cache read error (falling back to live compute):',
        err,
      );
    }
  }

  const results = await computeCategorySizeForecast(categories);

  if (isRedisConfigured()) {
    try {
      await getRedis().set(cacheKey, results, { ex: SIZE_FORECAST_CACHE_TTL_SECONDS });
    } catch (err) {
      console.error('getCategorySizeForecast cache write error (ignored):', err);
    }
  }

  return results;
}

/**
 * Per-size breakdown of ACTIVE-slot inventory across the given categories —
 * backs `GET /v1/categories/sizes`, the creative wizard's "Stærðir" step
 * (creative-wizard, 2026-07-27 plan): before any creative work, the
 * advertiser sees which banner sizes their chosen categories actually serve
 * and roughly how much of the forecast daily-impression volume each size
 * represents, so size selection becomes information rather than a decision.
 *
 * Extends `getCategoryInventory`'s trailing-7-day avgDailyImpressions calc,
 * which is necessarily per PUBLISHER (stats are only tracked at that
 * granularity — there is no per-slot impression history). That average is
 * spread evenly across the publisher's own ACTIVE slots (an even split is
 * the only defensible default without real per-slot stats), then evenly
 * again across however many sizes each of those slots declares (a slot's
 * `sizes` array lists which sizes CAN render there, not a guaranteed
 * multiplier of impressions).
 */
async function computeCategorySizeForecast(categories: string[]): Promise<CategorySizeForecast[]> {
  const pubSnap = await db
    .collection(COLLECTIONS.publishers)
    .where('status', '==', 'active')
    .withConverter(publisherConverter)
    .get();

  const dateKeys = lastNDateKeys(7);
  const slotCountBySize = new Map<string, { width: number; height: number; count: number }>();
  const forecastBySize = new Map<string, number>();

  for (const pubDoc of pubSnap.docs) {
    const pub = pubDoc.data();
    if (!pub.categories.some((cat) => categories.includes(cat))) continue;

    const slotSnap = await db
      .collection(COLLECTIONS.slots)
      .where('publisherId', '==', pub.id)
      .withConverter(slotConverter)
      .get();
    // Redundant with a `.where('status', '==', 'active')` query, kept
    // in-memory so unit-test mocks that ignore `.where()` (see
    // inventory.test.ts's pattern) still exercise the real filtering logic.
    const activeSlots = slotSnap.docs
      .map((d) => d.data())
      .filter((slot) => slot.status === 'active');
    if (activeSlots.length === 0) continue;

    let pubTotal = 0;
    for (const dk of dateKeys) {
      const statDoc = await db.doc(`${COLLECTIONS.stats}/publishers/${pub.id}/${dk}`).get();
      pubTotal += (statDoc.data()?.impressions ?? 0) as number;
    }
    const pubAvg = Math.round(pubTotal / dateKeys.length);
    const perSlotShare = pubAvg / activeSlots.length;

    for (const slot of activeSlots) {
      // Divide across EVERY size the slot declares (IAB or not) — that's
      // the real allocation of this slot's forecasted impressions. Only the
      // per-size MAPS below are filtered to IAB sizes, so a slot that also
      // declares a non-IAB size doesn't have its forecast inflated onto the
      // IAB sizes it also declares.
      const perSizeShare = perSlotShare / slot.sizes.length;
      for (const size of slot.sizes) {
        const key = `${size.width}x${size.height}`;
        if (!IAB_SIZE_KEYS.has(key)) continue; // B1: non-IAB sizes dead-end /generate/render
        const entry = slotCountBySize.get(key) ?? {
          width: size.width,
          height: size.height,
          count: 0,
        };
        entry.count += 1;
        slotCountBySize.set(key, entry);
        forecastBySize.set(key, (forecastBySize.get(key) ?? 0) + perSizeShare);
      }
    }
  }

  const totalForecast = [...forecastBySize.values()].reduce((sum, v) => sum + v, 0);
  const results: CategorySizeForecast[] = [...slotCountBySize.values()].map((entry) => {
    const key = `${entry.width}x${entry.height}`;
    const forecast = forecastBySize.get(key) ?? 0;
    // null (not 0) when the whole 7-day window is empty — see the
    // CategorySizeForecast doc comment for why 0 would be misleading here.
    const share = totalForecast > 0 ? forecast / totalForecast : null;
    return {
      width: entry.width,
      height: entry.height,
      slotCount: entry.count,
      // 4 decimals (not 2) so a real-but-small share survives rounding
      // instead of collapsing into the same 0 a true zero-contribution size
      // would show — the wizard's "minna en 1%" display fix depends on
      // being able to tell those two cases apart.
      forecastShare: share === null ? null : Math.round(share * 10000) / 10000,
    };
  });
  results.sort((a, b) => (b.forecastShare ?? 0) - (a.forecastShare ?? 0) || a.width - b.width);
  return results;
}
