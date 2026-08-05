import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import type { Transaction } from 'firebase-admin/firestore';
import { COLLECTIONS, campaignConverter } from '@ada/shared/firestore';
import { CampaignSchema, AD_CATEGORY_SLUGS, GeoRegionSchema } from '@ada/shared';
import type { Campaign, CampaignStatus, PendingReason } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';
import { AppError } from '../lib/errors.js';
import { getCreative } from './creatives.js';
import { getAvailableBalanceInTransaction, FUND_HOLDING_STATUSES } from './wallet.js';
import { pushCacheForCampaign } from '../lib/push-cache.js';
import { isRedisConfigured } from '../lib/redis.js';
import { getApiKeyRecord, type ApiKeyRecord } from './api-keys.js';
import { createNotification } from './notifications.js';
import { sendAgentCampaignPendingEmail } from './mail.js';
import { getAdvertiserById } from './advertisers.js';

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

/**
 * Trust context supplied by the route, never by the request body: which
 * channel created this campaign, and — for `ak_`-key channels — the key id
 * (drives the purchase gate below) and an optional caller-supplied
 * idempotency key (drives the replay-safe lookup below).
 *
 * Invariant this whole module leans on: one `ak_` key belongs to exactly one
 * advertiser (an owner's ownerEmail maps to a single advertiser profile via
 * getAdvertiserByOwnerEmail — see routes/campaigns.ts). That's what makes the
 * per-ADVERTISER `fundsVersion` optimistic-concurrency bump (below) also
 * correctly serialize the per-KEY monthly cap check: two concurrent creates
 * for the same key are necessarily also two concurrent creates for the same
 * advertiser, so they conflict and retry serially regardless of which cap
 * they're racing. If multi-advertiser accounts (one owner, several
 * advertiser profiles, or several keys per advertiser with independent caps)
 * ever land, this invariant breaks and the monthly-cap race test
 * ("lets exactly one of two concurrent creates through") would need a
 * key-scoped lock, not just the advertiser-scoped one.
 */
export interface CreateCampaignContext {
  channel: 'dashboard' | 'api' | 'mcp';
  apiKeyId?: string;
  idempotencyKey?: string;
}

const DASHBOARD_CONTEXT: CreateCampaignContext = { channel: 'dashboard' };

function agentCampaignsQueryFor(apiKeyId: string) {
  return db
    .collection(COLLECTIONS.campaigns)
    .where('createdVia.apiKeyId', '==', apiKeyId)
    .withConverter(campaignConverter);
}

/**
 * Sums budget.totalIsk over campaigns created via a given API key in the
 * current UTC calendar month — the derived (not separately counted) "month's
 * agent spend" for the monthly cap gate. Filtering by month happens in code,
 * not in the query (a composite (createdVia.apiKeyId, createdAt) index isn't
 * worth provisioning for this), same philosophy as sweepExpiredCampaigns.
 */
export function sumMonthToDateAgentSpend(campaigns: Campaign[], now: Date = new Date()): number {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthEndExclusive = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return campaigns.reduce((sum, c) => {
    const createdAtMs = c.createdAt?.getTime();
    if (createdAtMs === undefined) return sum;
    if (createdAtMs < monthStart || createdAtMs >= monthEndExclusive) return sum;
    return sum + c.budget.totalIsk;
  }, 0);
}

/** Non-transactional read for reporting (e.g. GET /v1/api-keys/me, MCP get_wallet). */
export async function getMonthToDateAgentSpend(apiKeyId: string): Promise<number> {
  const snap = await agentCampaignsQueryFor(apiKeyId).get();
  return sumMonthToDateAgentSpend(snap.docs.map((d) => d.data()));
}

export async function createCampaign(
  advertiserId: string,
  input: CreateCampaignInput,
  ctx: CreateCampaignContext = DASHBOARD_CONTEXT,
): Promise<Campaign & { idempotent?: boolean }> {
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

  // Purchase gate: an `ak_` key can only reach here (see the scope +
  // purchase.enabled check in routes/campaigns.ts) if purchase is enabled,
  // but re-verify fail-closed here too since this service function is the
  // one source of truth for campaign creation, not just the REST route.
  let purchase: ApiKeyRecord['purchase'] | undefined;
  if (ctx.apiKeyId) {
    const record = await getApiKeyRecord(ctx.apiKeyId);
    if (!record || record.revoked || !record.purchase?.enabled) {
      throw new AppError(
        403,
        'Purchase capability is not enabled for this API key',
        'PURCHASE_NOT_ENABLED',
      );
    }
    purchase = record.purchase;
  }

  // Whether creatives are already fully approved (may still be downgraded to
  // pending_approval inside the transaction below by the auto-approve-limit
  // gate). Computed once outside the transaction like the creative-ownership
  // checks above — creative review status isn't racing this transaction, so
  // it doesn't need to be re-read on retry.
  const allCreativesApproved = await allCreativesAutoApproved(parsed.creativeIds);

  const createdVia: Campaign['createdVia'] = {
    channel: ctx.channel,
    apiKeyId: ctx.apiKeyId,
    idempotencyKey: ctx.idempotencyKey,
  };

  // Committed-funds gate: the wallet's AVAILABLE balance (ledger balance minus
  // what's already committed to this advertiser's other fund-holding
  // campaigns) must cover the full budget. Runs in a transaction so two
  // concurrent creates for the same advertiser can't both read a wallet that
  // "has enough" for each of them independently — the advertiser doc write
  // (fundsVersion bump) is what forces the two transactions to conflict and
  // retry serially; Firestore doesn't otherwise conflict on phantom query
  // results across transactions. Same fail-closed philosophy as the serving
  // budget gate. The idempotency lookup and the monthly-agent-cap sum ride
  // inside the SAME transaction for the same reason — all reads happen
  // before any write, so a retry (forced by the advertiser doc write below)
  // re-reads everything fresh.
  const advRef = db.collection(COLLECTIONS.advertisers).doc(advertiserId);
  const result = await db.runTransaction(
    async (t: Transaction): Promise<{ campaign: Campaign; idempotent: boolean }> => {
      if (ctx.idempotencyKey) {
        const dupSnap = await t.get(
          db
            .collection(COLLECTIONS.campaigns)
            .where('createdVia.idempotencyKey', '==', ctx.idempotencyKey)
            .withConverter(campaignConverter),
        );
        // Scoped to advertiserId always, and ADDITIONALLY to the calling
        // `ak_` key when the caller is one: two different keys under the
        // same advertiser (e.g. two agents) coincidentally colliding on the
        // same derived idempotency key must not silently return each other's
        // campaign — see deriveIdempotencyKey in
        // apps/mcp/src/tools/advertiser/create-campaign.ts, which folds the
        // key id into the hash for exactly this reason. Non-key (dashboard)
        // callers keep the advertiser-only scoping, unchanged.
        const existing = dupSnap.docs
          .map((d) => d.data())
          .find(
            (c) =>
              c.advertiserId === advertiserId &&
              (!ctx.apiKeyId || c.createdVia?.apiKeyId === ctx.apiKeyId),
          );
        if (existing) {
          return { campaign: existing, idempotent: true };
        }
      }

      const advSnap = await t.get(advRef);
      if (!advSnap.exists) {
        throw new AppError(404, `Advertiser ${advertiserId} not found`, 'NOT_FOUND');
      }

      const { balanceIsk, committedIsk, availableIsk } = await getAvailableBalanceInTransaction(
        t,
        advertiserId,
      );

      if (ctx.apiKeyId && purchase) {
        const agentSnap = await t.get(agentCampaignsQueryFor(ctx.apiKeyId));
        const spentIsk = sumMonthToDateAgentSpend(agentSnap.docs.map((d) => d.data()));
        if (spentIsk + parsed.budget.totalIsk > purchase.monthlyCapIsk) {
          throw new AppError(
            402,
            `Monthly agent purchase cap exceeded (spent ${spentIsk} ISK this month, cap ${purchase.monthlyCapIsk} ISK, requested ${parsed.budget.totalIsk} ISK)`,
            'MONTHLY_CAP_EXCEEDED',
          );
        }
      }

      if (availableIsk < parsed.budget.totalIsk) {
        throw new AppError(
          402,
          `Insufficient available balance (balance ${balanceIsk} ISK, committed to other campaigns ${committedIsk} ISK, available ${availableIsk} ISK) for campaign budget of ${parsed.budget.totalIsk} ISK`,
          'INSUFFICIENT_FUNDS',
        );
      }

      // Determine overall status/pendingReason fresh on EVERY transaction
      // attempt (declared inside the callback, not hoisted `let`s mutated
      // from outside) — a retried attempt must never carry over a mutation
      // from a previous, possibly-aborted attempt.
      let status: CampaignStatus = allCreativesApproved ? 'active' : 'pending_approval';
      let pendingReason: PendingReason | undefined;
      if (purchase && parsed.budget.totalIsk > purchase.autoApproveLimitIsk) {
        status = 'pending_approval';
        pendingReason = 'agent_purchase';
      }

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
        createdAt: new Date(),
        createdVia,
        pendingReason,
      });

      t.update(advRef, { fundsVersion: FieldValue.increment(1) });
      t.set(
        db.collection(COLLECTIONS.campaigns).doc(campaign.id).withConverter(campaignConverter),
        campaign,
      );

      return { campaign, idempotent: false };
    },
  );

  if (!result.idempotent) {
    if (isRedisConfigured()) {
      await pushCacheForCampaign(result.campaign.id);
    }

    if (result.campaign.pendingReason === 'agent_purchase') {
      try {
        const advertiser = await getAdvertiserById(advertiserId);
        if (advertiser) {
          const amountLabel = `${result.campaign.budget.totalIsk.toLocaleString('is-IS')} kr.`;
          await createNotification({
            userEmail: advertiser.ownerEmail,
            role: 'advertiser',
            type: 'info',
            title: 'Agent óskar eftir herferð',
            message: `Agent bjó til herferð upp á ${amountLabel} sem er yfir sjálfvirku samþykktarmörkunum. Samþykktu eða hafnaðu til að hún fari í loftið.`,
            link: `/advertiser/campaigns/${result.campaign.id}`,
          });
          await sendAgentCampaignPendingEmail(
            advertiser.ownerEmail,
            advertiser.companyName,
            result.campaign.id,
            result.campaign.budget.totalIsk,
          );
        }
      } catch (err) {
        console.error('Error notifying owner of agent campaign pending approval:', err);
      }
    }
  }

  // `idempotent` is only present when a replay actually occurred — a fresh
  // create omits the field entirely rather than carrying `idempotent: false`,
  // so the response shape callers (dashboard, MCP) already depend on for a
  // normal create is unchanged.
  return result.idempotent ? { ...result.campaign, idempotent: true } : { ...result.campaign };
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

  // Fix 1c (pendingReason lifecycle): a campaign tagged `pendingReason:
  // 'agent_purchase'` is awaiting the OWNER's explicit approve/reject
  // decision (see approveAgentPurchaseCampaign / rejectAgentPurchaseCampaign
  // above) — the owner's own generic PATCH must not be able to flip its
  // status directly, which would both bypass that human-in-the-loop gate and
  // (for a reject-shaped PATCH to e.g. `paused`) detach the campaign from the
  // "pending campaigns never served" premise that lets rejection zero
  // totalIsk safely. Only the status field is blocked — other fields (name,
  // creatives, budget, targeting) remain editable on a pending campaign.
  if (parsed.status !== undefined && existing.pendingReason === 'agent_purchase') {
    throw new AppError(
      400,
      'This campaign is awaiting agent-purchase approval — use POST /v1/campaigns/:id/approve ' +
        'or /reject instead of changing status directly',
      'BAD_REQUEST',
    );
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
    pendingReason: status === 'pending_approval' ? existing.pendingReason : undefined,
  });

  // Invariant this whole module leans on (Fix 1, pendingReason lifecycle):
  // "pendingReason exists iff status is pending_approval, awaiting an
  // owner decision". Every writer of `status` other than createCampaign /
  // approveAgentPurchaseCampaign / rejectAgentPurchaseCampaign must clear the
  // tag the moment it moves the campaign OUT of pending_approval — otherwise
  // a campaign that completes via the creative-rejection branch in
  // services/approvals.ts or the expiry sweep below keeps looking like it's
  // still awaiting agent-purchase approval: the dashboard's
  // PendingAgentCampaigns card would show it forever, and
  // checkStaleAgentPendingCampaigns (services/reconciliation.ts) would keep
  // alerting ops about it daily.
  const updates: Record<string, unknown> =
    status === 'pending_approval' ? { status } : { status, pendingReason: FieldValue.delete() };
  await db.collection(COLLECTIONS.campaigns).doc(campaignId).update(updates);

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
 * Extend a COMPLETED campaign that still has leftover budget: new endsAt,
 * status back to `active`. The two "cannot be reactivated" guards above
 * exist because a generic status flip would re-acquire a wallet hold
 * without passing the committed-funds gate — this path exists precisely to
 * go THROUGH that gate, using the same transaction + fundsVersion-bump
 * serialization as createCampaign, so the invariant holds by construction.
 * Dashboard-only by policy (route rejects ak_ keys); no MCP path commits
 * funds.
 */
export async function extendCampaign(
  campaignId: string,
  advertiserId: string,
  newEndsAt: Date,
): Promise<Campaign> {
  if (newEndsAt.getTime() <= Date.now()) {
    throw new AppError(400, 'endsAt must be in the future', 'BAD_REQUEST');
  }

  const advRef = db.collection(COLLECTIONS.advertisers).doc(advertiserId);
  const cmpRef = db
    .collection(COLLECTIONS.campaigns)
    .doc(campaignId)
    .withConverter(campaignConverter);

  const extended = await db.runTransaction(async (t: Transaction): Promise<Campaign> => {
    const snap = await t.get(cmpRef);
    const existing = snap.exists ? snap.data()! : null;
    if (!existing || existing.advertiserId !== advertiserId) {
      throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
    }
    if (existing.status !== 'completed') {
      throw new AppError(400, 'Only completed campaigns can be extended', 'BAD_REQUEST');
    }
    if (existing.budget.remainingIsk <= 0) {
      throw new AppError(
        400,
        'Campaign has no remaining budget to extend with',
        'NO_REMAINING_BUDGET',
      );
    }

    // Read the advertiser doc INSIDE the transaction before gating funds:
    // the fundsVersion write below only serializes against concurrent
    // create/update transactions if this transaction holds advRef in its
    // read set — a blind write establishes no precondition, so without this
    // read a create that commits first is invisible (its campaign doc is a
    // phantom insert relative to our queries) and both holds go through.
    const advSnap = await t.get(advRef);
    if (!advSnap.exists) {
      throw new AppError(404, 'Advertiser not found', 'NOT_FOUND');
    }

    // Completed campaigns are not fund-holding, so the leftover is currently
    // released; excludeCampaignId is belt-and-braces should that ever change.
    const { availableIsk } = await getAvailableBalanceInTransaction(t, advertiserId, {
      excludeCampaignId: campaignId,
    });
    if (availableIsk < existing.budget.remainingIsk) {
      throw new AppError(
        400,
        `Insufficient available funds to re-reserve ${existing.budget.remainingIsk} ISK ` +
          `(available ${availableIsk} ISK)`,
        'INSUFFICIENT_FUNDS',
      );
    }

    const next = CampaignSchema.parse({
      ...existing,
      status: 'active',
      schedule: { ...existing.schedule, endsAt: newEndsAt },
    });

    // Same serialization write as createCampaign: forces concurrent
    // transactions on this advertiser to conflict and retry serially.
    t.update(advRef, { fundsVersion: FieldValue.increment(1) });
    // Targeted update (never whole-doc set): a concurrent accrual write to
    // budget.remainingIsk between our read and this write must survive.
    t.update(db.collection(COLLECTIONS.campaigns).doc(campaignId), {
      status: 'active',
      'schedule.endsAt': newEndsAt,
    });
    return next;
  });

  // Completion deleted budget:{id}/pace_limit:{id} and the serving gate is
  // fail-closed (missing key = 0) — reseed now so serving resumes without
  // waiting up to 10 min for cron-refresh-cache. pushCacheForCampaign sets
  // both keys from the fresh doc and restores slot mappings. Redis being
  // down is non-fatal: the cron reseeds, under-serving in the meantime.
  if (isRedisConfigured()) {
    await pushCacheForCampaign(campaignId);
  }

  return extended;
}

/**
 * Owner approval for a campaign an agent bought above its API key's
 * autoApproveLimitIsk (tagged `pendingReason: 'agent_purchase'` at create
 * time — see createCampaign above). Only valid on campaigns still carrying
 * that tag: a plain creative-review pending campaign (no tag) goes through
 * the ordinary approvals.ts flow instead. Activating still respects the
 * normal creative-approval logic — approving the AGENT'S purchase doesn't
 * bypass the separate creative-review gate.
 *
 * Wrapped in a transaction (Fix 6, adversarial review): the campaign is
 * re-read and its pendingReason re-checked INSIDE the transaction, and only
 * a targeted `t.update` is issued, so a concurrent
 * rejectAgentPurchaseCampaign racing the same campaign can't both "win" —
 * Firestore's transaction conflict/retry serializes them, and whichever one
 * loses re-reads the other's already-committed state and correctly fails its
 * `pendingReason !== 'agent_purchase'` check with 400 instead of silently
 * clobbering the winner's write. The cache push stays outside, after commit,
 * same as every other transactional write in this file.
 */
export async function approveAgentPurchaseCampaign(
  campaignId: string,
  advertiserId: string,
): Promise<Campaign> {
  const campaignRefRaw = db.collection(COLLECTIONS.campaigns).doc(campaignId);
  const campaignRefTyped = campaignRefRaw.withConverter(campaignConverter);

  const next = await db.runTransaction(async (t: Transaction): Promise<Campaign> => {
    const snap = await t.get(campaignRefTyped);
    if (!snap.exists) {
      throw new AppError(404, `Campaign ${campaignId} not found`, 'NOT_FOUND');
    }
    const existing = snap.data()!;
    if (existing.advertiserId !== advertiserId) {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
    // Both the tag AND the status must still be in the "awaiting owner
    // decision" state (see the pendingReason lifecycle invariant documented
    // at updateCampaignStatus below) — a campaign that already left
    // pending_approval (completed via creative-rejection, expiry sweep, or a
    // prior approve/reject) must not be resurrected just because a stale
    // pendingReason tag survived on it.
    if (existing.pendingReason !== 'agent_purchase' || existing.status !== 'pending_approval') {
      throw new AppError(400, 'Campaign is not awaiting agent-purchase approval', 'BAD_REQUEST');
    }

    const allApproved = await allCreativesAutoApproved(existing.creativeIds);
    const nextStatus: CampaignStatus = allApproved ? 'active' : 'pending_approval';

    t.update(campaignRefRaw, {
      status: nextStatus,
      pendingReason: FieldValue.delete(),
    });

    return CampaignSchema.parse({ ...existing, status: nextStatus, pendingReason: undefined });
  });

  if (isRedisConfigured()) {
    await pushCacheForCampaign(campaignId);
  }

  return next;
}

/**
 * Owner rejection of an agent-purchased campaign pending approval. Mirrors
 * the sole-creative-rejection release in services/approvals.ts: campaign
 * creation never touches the ledger (remainingIsk is a committed-funds HOLD,
 * not money taken out of the wallet — see getAvailableBalance in
 * services/wallet.ts), so releasing the hold is just a status change to
 * `completed` with remainingIsk zeroed. NO refund ledger entry — appending
 * one would credit money that was never debited.
 *
 * Also zeroes budget.totalIsk (Fix 5, adversarial review), not just
 * remainingIsk: a campaign stuck in pending_approval can never have served
 * (accrual only ever charges 'active' campaigns), so its true "spent" amount
 * is provably 0 — zeroing totalIsk alongside remainingIsk keeps the
 * reconciliation invariant `totalIsk - remainingIsk == sum(charges)` holding
 * at `0 - 0 == 0`, and — just as importantly — removes this campaign from
 * `sumMonthToDateAgentSpend` (services/campaigns.ts), which sums
 * `budget.totalIsk` over a key's campaigns this month. Without this, a
 * rejected purchase would go on permanently occupying headroom under the
 * key's monthly cap even though it was never allowed to spend a single ISK.
 *
 * Transactional for the same conflict-safety reason as
 * approveAgentPurchaseCampaign above (Fix 6) — see that function's comment.
 */
export async function rejectAgentPurchaseCampaign(
  campaignId: string,
  advertiserId: string,
): Promise<Campaign> {
  const campaignRefRaw = db.collection(COLLECTIONS.campaigns).doc(campaignId);
  const campaignRefTyped = campaignRefRaw.withConverter(campaignConverter);

  const next = await db.runTransaction(async (t: Transaction): Promise<Campaign> => {
    const snap = await t.get(campaignRefTyped);
    if (!snap.exists) {
      throw new AppError(404, `Campaign ${campaignId} not found`, 'NOT_FOUND');
    }
    const existing = snap.data()!;
    if (existing.advertiserId !== advertiserId) {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
    // Same "still awaiting owner decision" guard as approve above — a
    // completed/active/paused campaign whose pendingReason tag somehow
    // survived must not be re-rejected (which would zero its budget after it
    // may have already served real spend).
    if (existing.pendingReason !== 'agent_purchase' || existing.status !== 'pending_approval') {
      throw new AppError(400, 'Campaign is not awaiting agent-purchase approval', 'BAD_REQUEST');
    }

    t.update(campaignRefRaw, {
      status: 'completed',
      'budget.totalIsk': 0,
      'budget.remainingIsk': 0,
      pendingReason: FieldValue.delete(),
    });

    return CampaignSchema.parse({
      ...existing,
      status: 'completed',
      budget: { ...existing.budget, totalIsk: 0, remainingIsk: 0 },
      pendingReason: undefined,
    });
  });

  if (isRedisConfigured()) {
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
      // Isolate every document. `doc.data()` Zod-parses through
      // campaignConverter and throws on a malformed doc, and
      // updateCampaignStatus can throw on its own; either would otherwise
      // abort the whole sweep. That matters far beyond this function: the
      // 10-minute cron (api/cron-refresh-cache.js) runs the sweep BEFORE
      // refreshAllActiveSlotCaches, so an abort here means the cache is never
      // refreshed, every `budget:{id}` key expires on its 1h TTL, and the
      // fail-closed serve-time gate reads them as 0 — one bad document would
      // stop all ads on every publisher site within the hour.
      try {
        const campaign = doc.data();
        if (campaign.schedule.endsAt.getTime() < now) {
          await updateCampaignStatus(campaign.id, 'completed');
          swept++;
        }
      } catch (err) {
        // Log the message, not the error object: a ZodError carries a deep
        // issue tree that some console implementations fail to serialize, and
        // a throw here would defeat the whole point of this catch.
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[sweepExpiredCampaigns] skipping campaign ${doc.id}: ${reason}`);
      }
    }
  }

  return swept;
}
