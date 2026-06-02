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
} from '../schemas/publisher';

export type {
  Advertiser,
  AdvertiserStatus,
  Creative,
  ReviewStatus,
  ReviewLogEntry,
  AutoScanResult,
} from '../schemas/advertiser';

export type { Campaign, CampaignStatus, Schedule, Targeting, Budget } from '../schemas/campaign';

export type { LedgerEntry, LedgerEntryType, LedgerParty, Payout } from '../schemas/ledger';

export type { HourlyStats, PublisherStatsBreakdown } from '../schemas/stats';
