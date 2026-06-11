import { z } from 'zod';
import { COLLECTIONS, campaignConverter } from '@ada/shared/firestore';
import { CampaignSchema, AD_CATEGORY_SLUGS, GeoRegionSchema } from '@ada/shared';
import type { Campaign, CampaignStatus } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';
import { AppError } from '../lib/errors.js';
import { getCreative } from './creatives.js';
import { pushCacheForCampaign } from '../lib/push-cache.js';
import { isRedisConfigured } from '../lib/redis.js';

const CreateCampaignInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  creativeIds: z.array(z.string()).min(1),
  categories: z.array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]])).min(1),
  geoRegions: z.array(GeoRegionSchema).optional(),
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
  input: CreateCampaignInput,
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

  // Determine overall status
  const allCreativesApproved = await allCreativesAutoApproved(parsed.creativeIds);
  const status: CampaignStatus = allCreativesApproved ? 'active' : 'pending_approval';

  const campaign: Campaign = CampaignSchema.parse({
    id: generateId('cmp'),
    name: parsed.name,
    advertiserId,
    creativeIds: parsed.creativeIds,
    targeting: {
      categories: parsed.categories,
      geoRegions: parsed.geoRegions,
    },
    schedule: parsed.schedule,
    budget: {
      mode: parsed.budget.mode,
      totalIsk: parsed.budget.totalIsk,
      remainingIsk: parsed.budget.totalIsk,
    },
    status,
  });

  await db
    .collection(COLLECTIONS.campaigns)
    .doc(campaign.id)
    .withConverter(campaignConverter)
    .set(campaign);

  if (isRedisConfigured()) {
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
  return snap.exists ? snap.data() || null : null;
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
  name: z.string().min(1).max(120).optional(),
  creativeIds: z.array(z.string()).min(1).optional(),
  categories: z
    .array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]]))
    .min(1)
    .optional(),
  geoRegions: z.array(GeoRegionSchema).optional(),
  schedule: z
    .object({
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
    })
    .optional(),
  budget: z
    .object({
      totalIsk: z.number().int().positive(),
    })
    .optional(),
  status: z.enum(['active', 'paused']).optional(),
});

export async function updateCampaign(
  id: string,
  patch: z.infer<typeof UpdateCampaignSchema>,
): Promise<Campaign> {
  const existing = await getCampaign(id);
  if (!existing) {
    throw new AppError(404, `Campaign ${id} not found`, 'NOT_FOUND');
  }
  const parsed = UpdateCampaignSchema.parse(patch);

  // Validate creatives if updated
  if (parsed.creativeIds) {
    for (const cid of parsed.creativeIds) {
      const c = await getCreative(cid);
      if (!c) {
        throw new AppError(400, `Creative ${cid} not found`, 'BAD_REQUEST');
      }
      if (c.advertiserId !== existing.advertiserId) {
        throw new AppError(400, `Creative ${cid} is not owned by advertiser`, 'BAD_REQUEST');
      }
      if (c.reviewStatus === 'rejected') {
        throw new AppError(400, `Creative ${cid} is rejected`, 'BAD_REQUEST');
      }
    }
  }

  // Validate budget if updated
  let newBudget = existing.budget;
  if (parsed.budget) {
    const spent = existing.budget.totalIsk - existing.budget.remainingIsk;
    if (parsed.budget.totalIsk < spent) {
      throw new AppError(
        400,
        `Budget cannot be reduced below spent amount of ${spent} ISK`,
        'BAD_REQUEST',
      );
    }
    newBudget = {
      mode: existing.budget.mode,
      totalIsk: parsed.budget.totalIsk,
      remainingIsk: parsed.budget.totalIsk - spent,
    };
  }

  const targeting = {
    categories: parsed.categories ?? existing.targeting.categories,
    geoRegions: parsed.geoRegions !== undefined ? parsed.geoRegions : existing.targeting.geoRegions,
  };

  const next: Campaign = CampaignSchema.parse({
    id: existing.id,
    name: parsed.name !== undefined ? parsed.name : existing.name,
    advertiserId: existing.advertiserId,
    creativeIds: parsed.creativeIds ?? existing.creativeIds,
    targeting,
    schedule: parsed.schedule ?? existing.schedule,
    budget: newBudget,
    status: parsed.status ?? existing.status,
  });

  await db.collection(COLLECTIONS.campaigns).doc(id).withConverter(campaignConverter).set(next);

  if (isRedisConfigured()) {
    await pushCacheForCampaign(id);
  }

  return next;
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const existing = await getCampaign(campaignId);
  if (!existing) {
    throw new AppError(404, `Campaign ${campaignId} not found`, 'NOT_FOUND');
  }

  await db.collection(COLLECTIONS.campaigns).doc(campaignId).delete();

  if (isRedisConfigured()) {
    const { getRedis } = await import('../lib/redis.js');
    const redis = getRedis();
    await redis.del(`budget:${campaignId}`);
    await redis.del(`pace_limit:${campaignId}`);
    try {
      await pushCacheForCampaign(campaignId);
    } catch {
      // Ignore cache push error for deleted campaign
    }
  }
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
): Promise<Campaign> {
  const existing = await getCampaign(campaignId);
  if (!existing) {
    throw new AppError(404, `Campaign ${campaignId} not found`, 'NOT_FOUND');
  }

  const next = CampaignSchema.parse({
    ...existing,
    status,
  });

  await db
    .collection(COLLECTIONS.campaigns)
    .doc(campaignId)
    .withConverter(campaignConverter)
    .set(next);

  if (isRedisConfigured()) {
    if (status === 'paused' || status === 'completed') {
      const { getRedis } = await import('../lib/redis.js');
      const redis = getRedis();
      await redis.del(`budget:${campaignId}`);
      await redis.del(`pace_limit:${campaignId}`);
    }
    await pushCacheForCampaign(campaignId);
  }

  return next;
}
