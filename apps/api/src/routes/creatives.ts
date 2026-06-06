import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth.js';
import { getAdvertiserByOwnerEmail } from '../services/advertisers.js';
import {
  createCreative,
  getCreative,
  listCreativesForAdvertiser,
  updateCreative,
  deleteCreative,
} from '../services/creatives.js';
import { getCreativeStats, getAllCreativeStatsForAdvertiser } from '../services/creative-stats.js';
import { GeminiAutoScanner } from '../services/auto-scan/gemini.js';
import { AppError } from '../lib/errors.js';

const scanner = new GeminiAutoScanner();

export const creativesRouter = new Hono<Env>();
creativesRouter.use('*', requireAuth);

// Bulk stats for all creatives belonging to the authenticated advertiser
creativesRouter.get('/stats', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const hours = parseInt(c.req.query('hours') ?? '168', 10);
  const stats = await getAllCreativeStatsForAdvertiser(adv.id, hours);
  return c.json(stats);
});

creativesRouter.post('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const body = await c.req.json();
  const cre = await createCreative(adv.id, body, scanner);
  return c.json(cre, 201);
});

creativesRouter.get('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const list = await listCreativesForAdvertiser(adv.id);
  return c.json(list);
});

creativesRouter.get('/:id/stats', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const cre = await getCreative(c.req.param('id'));
  if (!cre) {
    throw new AppError(404, 'Creative not found', 'NOT_FOUND');
  }
  if (cre.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const stats = await getCreativeStats(cre.id);
  return c.json(stats);
});

creativesRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const cre = await getCreative(c.req.param('id'));
  if (!cre) {
    throw new AppError(404, 'Creative not found', 'NOT_FOUND');
  }
  if (cre.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  return c.json(cre);
});

creativesRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  const body = await c.req.json();
  const updated = await updateCreative(id, adv.id, body, scanner);
  return c.json(updated);
});

creativesRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  await deleteCreative(id, adv.id);
  return c.json({ success: true }, 200);
});
