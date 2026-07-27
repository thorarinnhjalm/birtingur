import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS, campaignConverter } from '@ada/shared/firestore';
import { CampaignSchema, AD_CATEGORY_SLUGS, GeoRegionSchema } from '@ada/shared';
import type { Campaign, CampaignStatus } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';
import { AppError } from '../lib/errors.js';
import { getCreative } from './creatives.js';
import { getAvailableBalanceInTransaction, FUND_HOLDING_STATUSES } from './wallet.js';
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

  // Committed-funds gate: the wallet's AVAILABLE balance (ledger balance minus
  // what's already committed to this advertiser's other fund-holding
  // campaigns) must cover the full budget. Runs in a transaction so two
  // concurrent creates for the same advertiser can't both read a wallet that
  // "has enough" for each of them independently — the advertiser doc write
  // (fundsVersion bump) is what forces the two transactions to conflict and
  // retry serially; Firestore doesn't otherwise conflict on phantom query
  // results across transactions. Same fail-closed philosophy as the serving
  // budget gate.
  const advRef = db.collection(COLLECTIONS.advertisers).doc(advertiserId);
  await db.runTransaction(async (t) => {
    const advSnap = await t.get(advRef);
    if (!advSnap.exists) {
      throw new AppError(404, `Advertiser ${advertiserId} not found`, 'NOT_FOUND');
    }

    const { balanceIsk, committedIsk, availableIsk } = await getAvailableBalanceInTransaction(
      t,
      advertiserId,
    );
    if (availableIsk < parsed.budget.totalIsk) {
      throw new AppError(
        402,
        `Insufficient available balance (balance ${balanceIsk} ISK, committed to other campaigns ${committedIsk} ISK, available ${availableIsk} ISK) for campaign budget of ${parsed.budget.totalIsk} ISK`,
        'INSUFFICIENT_FUNDS',
      );
    }

    t.update(advRef, { fundsVersion: FieldValue.increment(1) });
    t.set(
      db.collection(COLLECTIONS.campaigns).doc(campaign.id).withConverter(campaignConverter),
      campaign,
    );
  });

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

  // Completed campaigns have already released their fund hold (see
  // FUND_HOLDING_STATUSES in services/wallet.ts); every status this patch
  // can request (`active` | `paused`) is a fund-holding one, so silently
  // letting a completed campaign flip back to one would re-acquire a hold
  // without ever passing the committed-funds gate again.
  if (existing.status === 'completed' && parsed.status !== undefined) {
    throw new AppError(400, 'Completed campaigns cannot be reactivated', 'BAD_REQUEST');
  }

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

  const targeting = {
    categories: parsed.categories ?? existing.targeting.categories,
    geoRegions: parsed.geoRegions !== undefined ? parsed.geoRegions : existing.targeting.geoRegions,
  };

  // Validates the non-budget shape of the patch up front (schedule ordering,
  // targeting, etc.) using `existing.budget` as a placeholder — cheap fail
  // fast before touching Firestore. The actual persisted budget numbers are
  // always recomputed from a FRESH read inside the transaction below, never
  // from this (potentially stale) `existing` — that's the whole point of
  // this fix (see module-level comment on the three whole-doc-write bugs).
  const buildNext = (budget: Campaign['budget']): Campaign =>
    CampaignSchema.parse({
      id: existing.id,
      name: parsed.name !== undefined ? parsed.name : existing.name,
      advertiserId: existing.advertiserId,
      creativeIds: parsed.creativeIds ?? existing.creativeIds,
      targeting,
      schedule: parsed.schedule ?? existing.schedule,
      budget,
      status: parsed.status ?? existing.status,
    });
  buildNext(existing.budget);

  // Targeted Firestore dot-path updates for the non-budget fields actually
  // present in the patch — never includes a `budget.*` key here, and never
  // includes a key at all for a field the caller didn't touch, so a
  // concurrent accrual write to `budget.remainingIsk` (or any field we're
  // not asked to change) can't be clobbered by a whole-doc write built from
  // a stale read.
  const nonBudgetUpdates: Record<string, unknown> = {};
  if (parsed.name !== undefined) nonBudgetUpdates.name = parsed.name;
  if (parsed.creativeIds !== undefined) nonBudgetUpdates.creativeIds = parsed.creativeIds;
  if (parsed.categories !== undefined) nonBudgetUpdates['targeting.categories'] = parsed.categories;
  if (parsed.geoRegions !== undefined) nonBudgetUpdates['targeting.geoRegions'] = parsed.geoRegions;
  if (parsed.schedule !== undefined) nonBudgetUpdates.schedule = parsed.schedule;
  if (parsed.status !== undefined) nonBudgetUpdates.status = parsed.status;

  const campaignRefRaw = db.collection(COLLECTIONS.campaigns).doc(id);
  const campaignRefTyped = campaignRefRaw.withConverter(campaignConverter);

  let next: Campaign;

  if (parsed.budget) {
    const totalIsk = parsed.budget.totalIsk;
    const isIncrease = totalIsk > existing.budget.totalIsk;
    const advRef = db.collection(COLLECTIONS.advertisers).doc(existing.advertiserId);

    // Budget changes (increase OR decrease) always go through a transaction
    // that re-reads the campaign fresh — `spent` must reflect whatever an
    // in-flight accrual has already decremented, not the `existing` read
    // taken at the top of this function, or a concurrent accrual write
    // between that read and this one would get silently reverted.
    next = await db.runTransaction(async (t) => {
      const freshSnap = await t.get(campaignRefTyped);
      if (!freshSnap.exists) {
        throw new AppError(404, `Campaign ${id} not found`, 'NOT_FOUND');
      }
      const fresh = freshSnap.data()!;

      if (isIncrease) {
        const advSnap = await t.get(advRef);
        if (!advSnap.exists) {
          throw new AppError(404, `Advertiser ${existing.advertiserId} not found`, 'NOT_FOUND');
        }
      }

      const spent = fresh.budget.totalIsk - fresh.budget.remainingIsk;
      if (totalIsk < spent) {
        throw new AppError(
          400,
          `Budget cannot be reduced below spent amount of ${spent} ISK`,
          'BAD_REQUEST',
        );
      }
      const newRemaining = totalIsk - spent;

      if (isIncrease) {
        // Committed-funds gate on increases only (reductions never require
        // balance): the new remainingIsk must fit within the wallet's
        // available balance, excluding this campaign's own (fresh) committed
        // amount so it isn't double-counted against its own increase. Gate +
        // write happen in the same transaction, closing the same
        // concurrent-increase race as createCampaign (see the comment there
        // on the advertiser doc write).
        const { balanceIsk, committedIsk, availableIsk } = await getAvailableBalanceInTransaction(
          t,
          existing.advertiserId,
          { excludeCampaignId: existing.id },
        );
        if (availableIsk < newRemaining) {
          throw new AppError(
            402,
            `Insufficient available balance (balance ${balanceIsk} ISK, committed to other campaigns ${committedIsk} ISK, available ${availableIsk} ISK) for budget increase to ${totalIsk} ISK`,
            'INSUFFICIENT_FUNDS',
          );
        }
        t.update(advRef, { fundsVersion: FieldValue.increment(1) });
      }

      t.update(campaignRefRaw, {
        ...nonBudgetUpdates,
        'budget.totalIsk': totalIsk,
        'budget.remainingIsk': newRemaining,
      });

      return CampaignSchema.parse({
        id: fresh.id,
        name: parsed.name !== undefined ? parsed.name : fresh.name,
        advertiserId: fresh.advertiserId,
        creativeIds: parsed.creativeIds ?? fresh.creativeIds,
        targeting: {
          categories: parsed.categories ?? fresh.targeting.categories,
          geoRegions:
            parsed.geoRegions !== undefined ? parsed.geoRegions : fresh.targeting.geoRegions,
        },
        schedule: parsed.schedule ?? fresh.schedule,
        budget: { mode: fresh.budget.mode, totalIsk, remainingIsk: newRemaining },
        status: parsed.status ?? fresh.status,
      });
    });
  } else if (Object.keys(nonBudgetUpdates).length > 0) {
    // No budget field in the patch at all: a plain targeted update that
    // never touches `budget.*`, so it can't clobber a concurrent accrual
    // decrement regardless of how stale `existing` is.
    await campaignRefRaw.update(nonBudgetUpdates);
    next = buildNext(existing.budget);
  } else {
    // Empty patch — nothing to persist.
    next = existing;
  }

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

  // Same reactivation guard as updateCampaign: a completed campaign has
  // already released its fund hold, and every other CampaignStatus is
  // fund-holding (see FUND_HOLDING_STATUSES in services/wallet.ts) — flipping
  // it back would re-acquire that hold without ever passing the
  // committed-funds gate again. The expiry sweep (sweepExpiredCampaigns
  // below) only ever transitions INTO `completed`, never out of it, so this
  // can't break that flow.
  if (existing.status === 'completed' && FUND_HOLDING_STATUSES.has(status)) {
    throw new AppError(400, 'Completed campaigns cannot be reactivated', 'BAD_REQUEST');
  }

  // Validates the transition produces a structurally valid campaign. Only
  // `status` is actually written below, via a targeted update, so a
  // concurrent accrual write to `budget.remainingIsk` between this read and
  // that write can never be clobbered — unlike the old whole-doc `.set()`
  // built from this same (potentially stale) `existing` read.
  const next = CampaignSchema.parse({
    ...existing,
    status,
  });

  await db.collection(COLLECTIONS.campaigns).doc(campaignId).update({ status });

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

/**
 * Expiry sweep (Fix 1a): nothing else in production ever sets a campaign's
 * status to `completed` when `schedule.endsAt` passes, so its fund hold
 * (`budget.remainingIsk`, held for as long as status is in
 * FUND_HOLDING_STATUSES — see services/wallet.ts) would lock real wallet
 * money forever without this. Called from the 10-minute
 * cron-refresh-cache entrypoint, BEFORE the cache refresh runs, so a
 * campaign this sweep just completed is never re-cached as servable in the
 * same cron tick.
 *
 * Firestore can't cheaply query `schedule.endsAt < now` across several
 * statuses at once — that would need a composite (status, schedule.endsAt)
 * index per status, and none exists in firebase/firestore.indexes.json (the
 * one campaigns index there is for `status` + `targeting.slotIds`). Instead
 * this issues one single-field equality query per fund-holding status
 * (auto-indexed, no composite index needed) and filters `endsAt < now` in
 * code — simpler than provisioning four extra composite indexes for a
 * housekeeping sweep.
 */
export async function sweepExpiredCampaigns(): Promise<number> {
  const now = Date.now();
  let swept = 0;

  for (const status of FUND_HOLDING_STATUSES) {
    const snap = await db
      .collection(COLLECTIONS.campaigns)
      .where('status', '==', status)
      .withConverter(campaignConverter)
      .get();

    for (const doc of snap.docs) {
      const campaign = doc.data();
      if (campaign.schedule.endsAt.getTime() < now) {
        await updateCampaignStatus(campaign.id, 'completed');
        swept++;
      }
    }
  }

  return swept;
}
