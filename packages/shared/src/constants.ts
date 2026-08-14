/** Default platform fee percentage taken from publisher earnings */
export const DEFAULT_PLATFORM_FEE_PERCENT = 20;

/**
 * What a publisher actually earns from a gross figure, in whole krónur.
 *
 * The single definition. This had eight independent derivations across the
 * product — `Math.round(gross * 0.8)` in some places and
 * `Math.round(gross * (1 - FEE / 100))` in others — which happen to agree today
 * and would silently stop agreeing the day the fee moves. Two further surfaces
 * showed the GROSS figure under the word "tekjur" entirely: the embeddable
 * publisher stats widget and MCP `check_slot_delivery`, so a publisher reading
 * the widget on their own site saw 25% more than the dashboard told them.
 *
 * Deliberately `gross - round(gross * fee)` rather than `round(gross * (1 -
 * fee))`: that is how `services/wallet.ts` splits the same money into a
 * publisher credit and a platform fee, and the displayed figure must not differ
 * from the paid one by a króna. The two expressions diverge at a half-króna
 * boundary.
 */
export function publisherNetIsk(grossIsk: number): number {
  return grossIsk - Math.round(grossIsk * (DEFAULT_PLATFORM_FEE_PERCENT / 100));
}

/** Minimum payout amount; below this rolls into next month */
export const MIN_PAYOUT_ISK = 10000;

/** Maximum creative file size (2 MB) */
export const MAX_CREATIVE_SIZE_BYTES = 2 * 1024 * 1024;

/** IAB-aligned banner sizes commonly used by Icelandic publishers */
export const IAB_STANDARD_SIZES = [
  { width: 728, height: 90, name: 'Leaderboard' },
  { width: 300, height: 250, name: 'Medium Rectangle' },
  { width: 300, height: 600, name: 'Half Page' },
  { width: 320, height: 100, name: 'Mobile Banner' },
  { width: 980, height: 120, name: 'Billboard IS' },
] as const;

/** Geo targeting regions (Icelandic) */
export const GEO_REGIONS = [
  'all',
  'capital',
  'countryside',
  'reykjavik',
  'kopavogur',
  'hafnarfjordur',
  'gardabaer',
  'mosfellsbaer',
  'seltjarnarnes',
  'akureyri',
  'reykjanesbaer',
  'selfoss',
  'akranes',
  'isafjordur',
  'egilsstadir',
  'vestmannaeyjar',
] as const;
export type GeoRegion = (typeof GEO_REGIONS)[number];

/** Default frequency cap per visitor per day */
export const FREQUENCY_CAP_DEFAULT_PER_DAY = 3;

/**
 * Slot-cache TTL. This key encodes slot *existence* for the serving hot path, not just
 * freshness — a cache miss makes /v1/ad return {empty:true}, which drops the house ad and
 * suppresses the type=pageview pixel (so the publisher logs 0 pageviews). Content freshness
 * is owned by event-driven pushes (create/update/pause/campaign/approval) and the 10-min
 * refresh cron, so the TTL only needs to be a safety net long enough that a skipped, slow,
 * or misconfigured refresh cycle can't silently evict a registered slot. 7 days also self-
 * cleans orphaned keys since there is no slot-delete path that prunes the cache.
 */
export const SLOT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
/** Budget gate counter TTL — must outlive a cache cycle comfortably. */
export const BUDGET_COUNTER_TTL_SECONDS = 60 * 60; // 1h

/**
 * Event queues. Stats aggregation and CPM accrual are independent consumers, so they MUST
 * read from separate Redis lists — a single shared list let whichever cron popped first
 * cannibalize the other's events (accrual discarded pageviews/clicks, and impressions it
 * popped never reached stats). logEvent fans out: every event -> stats queue; impressions
 * also -> accrual queue. EVENT_QUEUE_LEGACY is the old shared list, drained once by the
 * stats aggregator so events queued before this split aren't lost.
 */
export const EVENT_QUEUE_STATS = 'events:stats';
export const EVENT_QUEUE_ACCRUAL = 'events:accrual';
export const EVENT_QUEUE_LEGACY = 'events:queue';

/**
 * Per-creative CTR counters powering the epsilon-greedy rotation between the
 * creative variants OF ONE CAMPAIGN (apps/serving/src/lib/select.ts).
 *
 * DELIBERATELY not under the `seen:` prefix: that namespace belongs to the
 * replay guard (`seen:imp:{sig}` / `seen:clk:{sig}` / `seen:pv:{sig}`, see
 * apps/serving/src/lib/crypto.ts), where a key's existence means "this exact
 * signature was already claimed". Parking a long-lived counter hash in there
 * would make that namespace mean two different things.
 *
 * Written by apps/serving (logEvent, inside the existing pipeline so the
 * counters cost no extra round trip), read by apps/api's push-cache when it
 * rebuilds a slot's cache entry. Both sides MUST use this builder.
 */
export function ctrCounterKey(campaignId: string, creativeId: string): string {
  return `ctr:${campaignId}:${creativeId}`;
}

/** Sliding window on the CTR counters, refreshed on every event. */
export const CTR_COUNTER_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Share of impressions spent exploring variants other than the current best.
 * The remaining 1 - BANDIT_EPSILON exploits the highest measured CTR.
 */
export const BANDIT_EPSILON = 0.2;

/**
 * Impressions a variant needs before its CTR is trusted. While ANY variant of a
 * campaign is below this, that campaign rotates evenly — a variant that got
 * unlucky in its first few draws would otherwise be buried before it ever had
 * enough evidence to defend itself.
 */
export const BANDIT_COLD_START_IMPRESSIONS = 100;

/**
 * Clicks a campaign's variants must have accumulated BETWEEN THEM before any of
 * them is treated as the winner.
 *
 * This gate is the difference between a bandit and a coin flip. Display
 * advertising runs at roughly 0.1% CTR, so BANDIT_COLD_START_IMPRESSIONS alone
 * clears a variant on ~0.1 clicks of evidence: every variant measures a CTR of
 * exactly zero, the comparison finds no winner, and the first entry in
 * `creativeIds` collects 1 - BANDIT_EPSILON of the traffic permanently — which
 * then makes it likelier to catch the first real click and cements the choice.
 * Measured before this gate existed, with the SECOND variant genuinely twice as
 * good: the first variant still took 3918 of 5000 impressions.
 *
 * Five clicks is not statistical significance and does not pretend to be. It is
 * the point below which the ranking is certainly noise. Campaigns quieter than
 * that simply rotate evenly, which is the honest answer.
 */
export const BANDIT_MIN_CLICKS = 5;

/**
 * Most creative variants of ONE campaign that push-cache will place in a single
 * slot cache entry.
 *
 * Two reasons for a bound. The cache entry is fetched in full on every `/v1/ad`
 * request, and `creativeIds` has a `.min(1)` but no upper limit — an advertiser
 * with 200 approved creatives in one campaign would otherwise put 200 objects
 * into every slot entry in their categories. And the rotation cannot use them:
 * each arm needs BANDIT_COLD_START_IMPRESSIONS before any comparison starts, so
 * arms beyond a handful only delay the campaign from ever leaving cold start.
 *
 * Exceeding it is logged by push-cache, never silently truncated.
 *
 * Three, set by the owner 2026-08-14, and it lines up with what the product
 * actually produces: the creative wizard writes 1-3 copy variants per campaign
 * (services/ai-creative/copy.ts), so a normal campaign never hits this bound.
 */
export const MAX_CACHED_VARIANTS_PER_CAMPAIGN = 3;

/** Snippet timeout for ad request before failing silent */
export const AD_REQUEST_TIMEOUT_MS = 2000;

/** VAT rate applied to platform top-ups */
export const VAT_RATE = 0.24;

/** Currency code (ISK only in V1) */
export const CURRENCY = 'ISK' as const;

/** Flat CPM rate applied to all ad impressions */
export const FLAT_CPM_ISK = 550;

/** Ad-buying content categories (advertiser picks these; publisher belongs to 1..n). */
export const AD_CATEGORIES = [
  { slug: 'matur', label: 'Matur & matreiðsla' },
  { slug: 'ferdalog', label: 'Ferðalög' },
  { slug: 'tiska_fegurd', label: 'Tíska & fegurð' },
  { slug: 'taekni', label: 'Tækni' },
  { slug: 'heilsa_likamsraekt', label: 'Heilsa & líkamsrækt' },
  { slug: 'fjarmal_vidskipti', label: 'Fjármál & viðskipti' },
  { slug: 'ithrottir', label: 'Íþróttir' },
  { slug: 'born_foreldrar', label: 'Börn & foreldrar' },
  { slug: 'bilar', label: 'Bílar' },
  { slug: 'heimili_honnun', label: 'Heimili & hönnun' },
  { slug: 'afthreying_menning', label: 'Afþreying & menning' },
  { slug: 'dyr_gaeludyr', label: 'Dýr & gæludýr' },
] as const;

export const AD_CATEGORY_SLUGS = AD_CATEGORIES.map((c) => c.slug) as readonly string[];
export type AdCategory = (typeof AD_CATEGORIES)[number]['slug'];

/**
 * Sensitive creative categories publishers can block (brand safety).
 * A creative carries 0..n of these flags from auto-scan; publishers block from this list.
 * Note: alcohol, tobacco and gambling advertising are also legally restricted in Iceland —
 * these flags enable future admin enforcement, but legal enforcement is not done here.
 */
export const SENSITIVE_AD_CATEGORIES = [
  { slug: 'afengi', label: 'Áfengi' },
  { slug: 'vedmal', label: 'Veðmál & happdrætti' },
  { slug: 'stefnumot', label: 'Stefnumót' },
  { slug: 'rafmyntir', label: 'Rafmyntir & áhættufjárfestingar' },
  { slug: 'megrun_utlit', label: 'Megrun & útlitsaðgerðir' },
  { slug: 'politik', label: 'Stjórnmál' },
  { slug: 'trumal', label: 'Trúmál' },
  { slug: 'tobak_veip', label: 'Tóbak & veip' },
  { slug: 'kynlifstengt', label: 'Kynlífstengt efni' },
] as const;

export const SENSITIVE_AD_CATEGORY_SLUGS = SENSITIVE_AD_CATEGORIES.map(
  (c) => c.slug,
) as readonly string[];
export type SensitiveAdCategory = (typeof SENSITIVE_AD_CATEGORIES)[number]['slug'];

/**
 * Synthetic byCreative key for the campaign-stats "legacy remainder" row: stats
 * recorded before per-creative-per-site attribution shipped (or lost to a since-
 * fixed aggregation bug) can't be attributed to a specific creative, so the
 * unattributed impressions/clicks are bucketed under this sentinel id instead of
 * being dropped. Shared so `apps/api`'s campaign-stats service and the dashboard's
 * CampaignDetail page agree on the literal without either hardcoding it.
 */
export const UNATTRIBUTED_CREATIVE_ID = '__unattributed';

/** The day true per-page-load traffic measurement began. Before this, the
 * stored `pageviews` figure counted ad-slot loads (one per slot per page),
 * which overstated a publisher's traffic by their slots-per-page ratio —
 * it cannot be corrected retroactively, so the accurate series starts here
 * (2026-08-09 design). */
export const TRAFFIC_MEASUREMENT_START = '2026-08-09';

/** The day the aggregator began splitting an ad request that found no
 * advertiser from one that was filled but never seen (`unfilled` in
 * services/stats-aggregator.ts). Every window before this renders as unmeasured
 * rather than as perfect fill — the same contract as TRAFFIC_MEASUREMENT_START
 * above, and hardcoding the date into UI copy instead of reading it here is how
 * the two silently drift apart. */
export const FILL_MEASUREMENT_START = '2026-08-14';
