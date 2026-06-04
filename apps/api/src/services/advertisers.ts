import { z } from 'zod';
import { COLLECTIONS, advertiserConverter } from '@ada/shared/firestore';
import { AdvertiserSchema } from '@ada/shared';
import type { Advertiser } from '@ada/shared/types';
import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';
import { AppError } from '../lib/errors.js';

const CreateAdvertiserSchema = z.object({
  ownerEmail: z.string().email(),
  companyName: z.string().min(1).max(200),
  kennitala: z
    .string()
    .transform((val) => val.replace(/[-\s]/g, ''))
    .pipe(z.string().regex(/^\d{10}$/)),
  vatNumber: z.string().min(1).max(20),
  websiteUrl: z.string().url().optional(),
});

export type CreateAdvertiserInput = z.infer<typeof CreateAdvertiserSchema>;

export async function createAdvertiser(input: CreateAdvertiserInput): Promise<Advertiser> {
  const parsed = CreateAdvertiserSchema.parse(input);
  const existing = await getAdvertiserByOwnerEmail(parsed.ownerEmail);
  if (existing) {
    throw new AppError(409, `Advertiser exists for ${parsed.ownerEmail}`, 'CONFLICT');
  }

  const adv: Advertiser = AdvertiserSchema.parse({
    id: generateId('adv'),
    ownerEmail: parsed.ownerEmail,
    companyName: parsed.companyName,
    kennitala: parsed.kennitala,
    vatNumber: parsed.vatNumber,
    walletBalanceIsk: 0,
    status: 'active',
    createdAt: new Date(),
    websiteUrl: parsed.websiteUrl,
  });

  await db
    .collection(COLLECTIONS.advertisers)
    .doc(adv.id)
    .withConverter(advertiserConverter)
    .set(adv);

  return adv;
}

export async function getAdvertiserById(id: string): Promise<Advertiser | null> {
  const snap = await db
    .collection(COLLECTIONS.advertisers)
    .doc(id)
    .withConverter(advertiserConverter)
    .get();
  return snap.exists ? snap.data() || null : null;
}

export async function getAdvertiserByOwnerEmail(email: string): Promise<Advertiser | null> {
  const snap = await db
    .collection(COLLECTIONS.advertisers)
    .where('ownerEmail', '==', email)
    .limit(1)
    .withConverter(advertiserConverter)
    .get();
  return snap.empty ? null : snap.docs[0]!.data() || null;
}

export async function requireAdvertiser(email: string): Promise<Advertiser> {
  const a = await getAdvertiserByOwnerEmail(email);
  if (!a) {
    throw new AppError(404, `No advertiser for ${email}`, 'NOT_FOUND');
  }
  return a;
}

export async function updateAdvertiserStatus(
  advertiserId: string,
  status: 'active' | 'suspended',
): Promise<Advertiser> {
  const advRef = db
    .collection(COLLECTIONS.advertisers)
    .doc(advertiserId)
    .withConverter(advertiserConverter);
  const doc = await advRef.get();
  if (!doc.exists) {
    throw new AppError(404, `Advertiser with ID ${advertiserId} not found`, 'NOT_FOUND');
  }

  const current = doc.data()!;
  const updated = AdvertiserSchema.parse({ ...current, status });
  await advRef.set(updated);

  // Invalidate slot cache for all slots targeted by this advertiser's campaigns
  const campaignsSnap = await db
    .collection(COLLECTIONS.campaigns)
    .where('advertiserId', '==', advertiserId)
    .get();

  const { pushCacheForCampaign } = await import('../lib/push-cache.js');
  for (const campDoc of campaignsSnap.docs) {
    await pushCacheForCampaign(campDoc.id);
  }

  return updated;
}
