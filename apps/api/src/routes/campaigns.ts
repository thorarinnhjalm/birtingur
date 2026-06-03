import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth';
import { getAdvertiserByOwnerEmail } from '../services/advertisers';
import {
  createCampaign,
  getCampaign,
  listCampaignsForAdvertiser,
  updateCampaign,
} from '../services/campaigns';
import { getCampaignStats } from '../services/campaign-stats';
import { AppError } from '../lib/errors';
import {
  getOrCreateWidgetKey,
  getWidgetKeyByTargetId,
  issueWidgetKey,
  revokeWidgetKey,
} from '../services/widget-keys.js';

export const campaignsRouter = new Hono<Env>();
campaignsRouter.use('*', requireAuth);

campaignsRouter.post('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const body = await c.req.json();
  const cmp = await createCampaign(adv.id, body);

  // Provision default campaign widget viewer key
  await getOrCreateWidgetKey(user.email, 'campaign', cmp.id);

  return c.json({ campaign: cmp }, 201);
});

campaignsRouter.get('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const list = await listCampaignsForAdvertiser(adv.id);
  return c.json({ campaigns: list });
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
  return c.json({ campaign: cmp });
});

campaignsRouter.patch('/:id', async (c) => {
  const user = c.get('user');
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
  return c.json({ campaign: cmp });
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
  const stats = await getCampaignStats(id);
  return c.json({ stats });
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
