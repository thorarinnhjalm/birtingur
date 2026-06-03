import { z } from 'zod';
import { COLLECTIONS, campaignConverter } from '@ada/shared/firestore';
import { CampaignSchema } from '@ada/shared';
import type { Campaign, CampaignStatus } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { AppError } from '../lib/errors';
import { getCreative } from './creatives';
import { getSlot } from './slots';
import { getPublisherById } from './publishers';
import { pushCacheForCampaign } from '../lib/push-cache';

const CreateCampaignInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  creativeIds: z.array(z.string()).min(1),
  slotIds: z.array(z.string()).min(1),
  schedule: z.object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  }),
  budget: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('cpm_capped'), totalIsk: z.number().int().positive() }),
    z.object({ mode: z.literal('slot_purchased'), totalIsk: z.number().int().positive() }),
  ]),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export async function createCampaign(
  advertiserId: string,
  input: CreateCampaignInput
): Promise<Campaign> {
  const parsed = CreateCampaignInputSchema.parse(input);

  // Verify all creatives exist & belong to advertiser
  for (const cid of parsed.creativeIds) {
    const c = await getCreative(cid);
    if (!c) {
      throw new AppError(400, `Creative ${cid} not found`, 'BAD_REQUEST');
    }
    if (c.advertiserId !== advertiserId) {
      throw new AppError(400, `Creative ${cid} is not owned by advertiser`, 'BAD_REQUEST');
    }
    if (c.reviewStatus === 'rejected') {
      throw new AppError(400, `Creative ${cid} is rejected`, 'BAD_REQUEST');
    }
  }

  // Build per-publisher approval map from slot lookups
  const perPublisherApproval: Record<string, 'pending' | 'approved' | 'rejected'> = {};
  for (const sid of parsed.slotIds) {
    const slot = await getSlot(sid);
    if (!slot) {
      throw new AppError(400, `Slot ${sid} not found`, 'BAD_REQUEST');
    }
    const pub = await getPublisherById(slot.publisherId);
    if (!pub) {
      throw new AppError(400, `Publisher for slot ${sid} not found`, 'BAD_REQUEST');
    }
    perPublisherApproval[pub.id] = pub.contentPolicy.requireManualApproval ? 'pending' : 'approved';
  }

  // Determine overall status
  const allCreativesApproved = await allCreativesAutoApproved(parsed.creativeIds);
  const allPublishersApproved = Object.values(perPublisherApproval).every((v) => v === 'approved');
  const status: CampaignStatus =
    allCreativesApproved && allPublishersApproved ? 'active' : 'pending_approval';

  const campaign: Campaign = CampaignSchema.parse({
    id: generateId('cmp'),
    advertiserId,
    creativeIds: parsed.creativeIds,
    targeting: { slotIds: parsed.slotIds },
    schedule: parsed.schedule,
    budget: {
      mode: parsed.budget.mode,
      totalIsk: parsed.budget.totalIsk,
      remainingIsk: parsed.budget.totalIsk,
    },
    status,
    perPublisherApproval,
  });

  await db
    .collection(COLLECTIONS.campaigns)
    .doc(campaign.id)
    .withConverter(campaignConverter)
    .set(campaign);

  if (process.env.UPSTASH_REDIS_REST_URL) {
    await pushCacheForCampaign(campaign.id);
  }

  return campaign;
}

async function allCreativesAutoApproved(ids: string[]): Promise<boolean> {
  for (const id of ids) {
    const c = await getCreative(id);
    if (!c) return false;
    if (c.reviewStatus !== 'auto_approved' && c.reviewStatus !== 'manual_approved') {
      return false;
    }
  }
  return true;
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .doc(id)
    .withConverter(campaignConverter)
    .get();
  return snap.exists ? (snap.data() || null) : null;
}

export async function listCampaignsForAdvertiser(advertiserId: string): Promise<Campaign[]> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where('advertiserId', '==', advertiserId)
    .withConverter(campaignConverter)
    .get();
  return snap.docs.map((d) => d.data());
}

const UpdateCampaignSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
});

export async function updateCampaign(
  id: string,
  patch: z.infer<typeof UpdateCampaignSchema>
): Promise<Campaign> {
  const existing = await getCampaign(id);
  if (!existing) {
    throw new AppError(404, `Campaign ${id} not found`, 'NOT_FOUND');
  }
  const parsed = UpdateCampaignSchema.parse(patch);
  const next: Campaign = CampaignSchema.parse({ ...existing, ...parsed });
  await db
    .collection(COLLECTIONS.campaigns)
    .doc(id)
    .withConverter(campaignConverter)
    .set(next);

  if (process.env.UPSTASH_REDIS_REST_URL) {
    await pushCacheForCampaign(id);
  }

  return next;
}
