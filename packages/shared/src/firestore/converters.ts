import { Timestamp } from 'firebase-admin/firestore';
import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { PublisherSchema, SlotSchema } from '../schemas/publisher.js';
import { AdvertiserSchema, CreativeSchema } from '../schemas/advertiser.js';
import { CampaignSchema } from '../schemas/campaign.js';
import { LedgerEntrySchema, PayoutSchema } from '../schemas/ledger.js';
import { NotificationSchema } from '../schemas/notification.js';
import type { Publisher, Slot } from '../schemas/publisher.js';
import type { Advertiser, Creative } from '../schemas/advertiser.js';
import type { Campaign } from '../schemas/campaign.js';
import type { LedgerEntry, Payout } from '../schemas/ledger.js';
import type { Notification } from '../schemas/notification.js';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Recursively walk an object converting Date instances to Firestore Timestamps.
 */
function datesToTimestamps(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(datesToTimestamps);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = datesToTimestamps(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursively walk converting Firestore Timestamps to Date instances.
 */
function timestampsToDates(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(timestampsToDates);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = timestampsToDates(v);
    }
    return out;
  }
  return value;
}

/**
 * Build a Firestore data converter for an entity that has an `id` field.
 * The converter validates the entity through its Zod schema on read.
 */
function makeConverter<T extends { id: string }>(
  schema: ZodType<T, ZodTypeDef, unknown>,
): FirestoreDataConverter<T> {
  return {
    toFirestore(value: T): DocumentData {
      const rest = { ...value } as Partial<T>;
      delete rest.id;
      return datesToTimestamps(rest) as DocumentData;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): T {
      const raw = timestampsToDates(snapshot.data());
      const withId = { id: snapshot.id, ...(raw as Record<string, unknown>) };
      return schema.parse(withId);
    },
  };
}

export const publisherConverter = makeConverter<Publisher>(PublisherSchema);
export const slotConverter = makeConverter<Slot>(SlotSchema);
export const advertiserConverter = makeConverter<Advertiser>(AdvertiserSchema);
export const creativeConverter = makeConverter<Creative>(CreativeSchema);
export const campaignConverter = makeConverter<Campaign>(CampaignSchema);
export const ledgerEntryConverter = makeConverter<LedgerEntry>(LedgerEntrySchema);
export const payoutConverter = makeConverter<Payout>(PayoutSchema);
export const notificationConverter = makeConverter<Notification>(NotificationSchema);
