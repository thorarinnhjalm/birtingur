// Inferred types are exported from each schema module.
// This file exists so consumers can do `import type { Publisher } from '@ada/shared/types'`.
export type {
  Publisher,
  PublisherStatus,
  PayoutMethod,
  ContentPolicy,
  Slot,
  Size,
  Pricing,
  Placement,
} from '../schemas/publisher.js';

export type {
  Advertiser,
  AdvertiserStatus,
  Creative,
  ReviewStatus,
  ReviewLogEntry,
  AutoScanResult,
} from '../schemas/advertiser.js';

export type { Campaign, CampaignStatus, Schedule, Targeting, Budget } from '../schemas/campaign.js';

export type { LedgerEntry, LedgerEntryType, LedgerParty, Payout } from '../schemas/ledger.js';

export type { HourlyStats, PublisherStatsBreakdown } from '../schemas/stats.js';
export type { WidgetKey, WidgetKeyType } from '../schemas/widget-key.js';
export type { WaitlistEntry, CreateWaitlistInput, WaitlistRole } from '../schemas/waitlist.js';

export interface CachedCreative {
  creativeId: string;
  campaignId: string;
  imageUrl: string;
  clickUrl: string;
  width: number;
  height: number;
  weight: number;
  geoCountries?: string[];
  geoRegions?: string[];
  frequencyCapPerDay: number;
  budgetExhausted: boolean;
  validFrom: number; // ms epoch
  validTo: number; // ms epoch
  priority: 'slot_purchased' | 'cpm';
  /**
   * Cached CTR evidence for the epsilon-greedy rotation between the variants of
   * ONE campaign (apps/serving/src/lib/select.ts). Baked in by push-cache from
   * the `ctr:{campaignId}:{creativeId}` counters every cache refresh, so the ad
   * hot path pays no extra Redis round trip to read it.
   *
   * OPTIONAL on purpose, and absence is the fail-safe: cache entries written by
   * an older push-cache carry no counters, and push-cache omits the field
   * entirely when Redis is unreachable. Selection reads a missing field as
   * "no evidence" and falls back to the pre-bandit even rotation.
   */
  ctr?: { imp: number; clk: number };
}

export interface SlotCacheEntry {
  slotId: string;
  publisherId: string;
  sizes: Array<{ width: number; height: number }>;
  pricing:
    | { mode: 'cpm'; cpmIsk: number }
    | { mode: 'slot'; slotPriceIsk: number; slotPeriodDays: number };
  activeCreatives: CachedCreative[];
  blockedCategories: string[];
  refreshedAt: number;
  fallbackType?: 'house_ad' | 'transparent';
}
