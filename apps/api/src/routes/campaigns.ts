import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, requireScope, rejectApiKeyMutation, type Env } from '../lib/auth.js';
import { getAdvertiserByOwnerEmail } from '../services/advertisers.js';
import {
  createCampaign,
  getCampaign,
  listCampaignsForAdvertiser,
  updateCampaign,
  approveAgentPurchaseCampaign,
  rejectAgentPurchaseCampaign,
  extendCampaign,
  type CreateCampaignContext,
} from '../services/campaigns.js';
import { getApiKeyRecord } from '../services/api-keys.js';
import { getCampaignStats } from '../services/campaign-stats.js';
import { AppError } from '../lib/errors.js';
import {
  getOrCreateWidgetKey,
  getWidgetKeyByTargetId,
  issueWidgetKey,
  revokeWidgetKey,
} from '../services/widget-keys.js';

export const campaignsRouter = new Hono<Env>();
campaignsRouter.use('*', requireAuth);
campaignsRouter.use('*', requireScope('advertiser'));

campaignsRouter.post('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }

  // Purchase gate: an `ak_` key can only create campaigns if its owner has
  // explicitly turned on purchase for this key (see services/api-keys.ts —
  // no defaults, fail-closed). requireScope above already rejects
  // publisher-scoped keys; this is the additional, purchase-specific check.
  let ctx: CreateCampaignContext;
  if (user.apiKeyId) {
    const record = await getApiKeyRecord(user.apiKeyId);
    if (!record || record.revoked || !record.purchase?.enabled) {
      throw new AppError(
        403,
        'Purchase capability is not enabled for this API key',
        'PURCHASE_NOT_ENABLED',
      );
    }
    // The MCP server tags its own calls with X-Ada-Channel so campaigns it
    // creates are distinguishable from a raw `ak_` key used directly against
    // the REST API — both otherwise look identical (same bearer auth).
    const channel = c.req.header('X-Ada-Channel') === 'mcp' ? 'mcp' : 'api';
    ctx = {
      channel,
      apiKeyId: user.apiKeyId,
      idempotencyKey: c.req.header('Idempotency-Key') || undefined,
    };
  } else {
    ctx = { channel: 'dashboard' };
  }

  const body = await c.req.json();
  const cmp = await createCampaign(adv.id, body, ctx);

  // Provision default campaign widget viewer key
  await getOrCreateWidgetKey(user.email, 'campaign', cmp.id);

  return c.json(cmp, cmp.idempotent ? 200 : 201);
});

// Owner approval flow for a campaign an agent bought above its API key's
// autoApproveLimitIsk (pendingReason: 'agent_purchase'). Dashboard/ID-token
// auth only — an `ak_` key (the thing that created the pending campaign in
// the first place) cannot also approve it, so requireScope above rejecting
// publisher keys isn't enough here; block ALL API keys explicitly.
campaignsRouter.post('/:id/approve', async (c) => {
  const user = c.get('user');
  if (user.apiKeyId) {
    throw new AppError(403, 'API keys cannot approve campaigns', 'FORBIDDEN');
  }
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const cmp = await approveAgentPurchaseCampaign(c.req.param('id'), adv.id);
  return c.json(cmp);
});

campaignsRouter.post('/:id/reject', async (c) => {
  const user = c.get('user');
  if (user.apiKeyId) {
    throw new AppError(403, 'API keys cannot reject campaigns', 'FORBIDDEN');
  }
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const cmp = await rejectAgentPurchaseCampaign(c.req.param('id'), adv.id);
  return c.json(cmp);
});

const ExtendBodySchema = z.object({ endsAt: z.coerce.date() });

// Extension re-acquires a wallet hold — dashboard-only, like approve/reject
// and every other operation that commits funds.
campaignsRouter.post('/:id/extend', async (c) => {
  const user = c.get('user');
  if (user.apiKeyId) {
    throw new AppError(403, 'API keys cannot extend campaigns', 'FORBIDDEN');
  }
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const body = ExtendBodySchema.parse(await c.req.json());
  const cmp = await extendCampaign(c.req.param('id'), adv.id, body.endsAt);
  return c.json(cmp);
});

campaignsRouter.get('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const list = await listCampaignsForAdvertiser(adv.id);

  // Fetch stats for all campaigns in parallel
  const enrichedList = await Promise.all(
    list.map(async (cmp) => {
      try {
        const stats = await getCampaignStats(cmp.id, 24 * 30); // 30 days
        const ctr =
          stats.impressions > 0 ? Math.min(100, (stats.clicks / stats.impressions) * 100) : 0;
        return {
          ...cmp,
          stats: {
            impressions: stats.impressions,
            clicks: stats.clicks,
            ctr,
          },
        };
      } catch (err) {
        console.error(`Failed to fetch stats for campaign ${cmp.id}:`, err);
        return {
          ...cmp,
          stats: {
            impressions: 0,
            clicks: 0,
            ctr: 0,
          },
        };
      }
    }),
  );

  return c.json(enrichedList);
});

campaignsRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const cmp = await getCampaign(c.req.param('id'));
  if (!cmp) {
    throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  }
  if (cmp.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  return c.json(cmp);
});

// Dashboard/ID-token only — no MCP tool exposes campaign PATCH (status or
// budget), so an `ak_` key reaching this is a raw REST call, not a
// sanctioned agent workflow. Blocking it closes both an agent
// self-activating its own pending_approval campaign (status: 'active') and
// a monthly-cap bypass via budget increase — see rejectApiKeyMutation.
campaignsRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'update campaigns');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  const existing = await getCampaign(id);
  if (!existing) {
    throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  }
  if (existing.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const body = await c.req.json();
  const cmp = await updateCampaign(id, body);
  return c.json(cmp);
});

campaignsRouter.get('/:id/stats', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  const cmp = await getCampaign(id);
  if (!cmp) {
    throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  }
  if (cmp.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const queryTimeframe = c.req.query('timeframe');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  let stats;
  if (startDate && endDate) {
    stats = await getCampaignStats(id, { startDate, endDate });
  } else {
    const parsedTimeframe = queryTimeframe ? parseInt(queryTimeframe, 10) : 30;
    const timeframeDays = isNaN(parsedTimeframe) ? 30 : parsedTimeframe;
    stats = await getCampaignStats(id, timeframeDays * 24);
  }
  return c.json(stats);
});

campaignsRouter.get('/:id/widget-key', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  const cmp = await getCampaign(id);
  if (!cmp) {
    throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  }
  if (cmp.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const keyRecord = await getOrCreateWidgetKey(user.email, 'campaign', id);
  return c.json({ key: keyRecord.key });
});

campaignsRouter.post('/:id/widget-key/rotate', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  const cmp = await getCampaign(id);
  if (!cmp) {
    throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  }
  if (cmp.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const existing = await getWidgetKeyByTargetId(id, 'campaign');
  if (existing) {
    await revokeWidgetKey(existing.id);
  }
  const newKey = await issueWidgetKey(user.email, 'campaign', id);
  return c.json({ key: newKey.key });
});
