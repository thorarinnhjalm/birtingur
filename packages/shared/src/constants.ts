/** Default platform fee percentage taken from publisher earnings */
export const DEFAULT_PLATFORM_FEE_PERCENT = 20;

/** Minimum payout amount; below this rolls into next month */
export const MIN_PAYOUT_ISK = 5000;

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
export const GEO_REGIONS = ['all', 'capital', 'countryside'] as const;
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
