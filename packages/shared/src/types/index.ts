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
