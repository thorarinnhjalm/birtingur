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

/** Hot slot-cache eviction TTL (kept short; a refresh cron rebuilds active slots). */
export const SLOT_CACHE_TTL_SECONDS = 15 * 60; // 15 min
/** Budget gate counter TTL — must outlive a cache cycle comfortably. */
export const BUDGET_COUNTER_TTL_SECONDS = 60 * 60; // 1h

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
