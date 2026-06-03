import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth';
import { getAdvertiserByOwnerEmail } from '../services/advertisers';
import { createCreative, getCreative, listCreativesForAdvertiser } from '../services/creatives';
import { StubAutoScanner } from '../services/auto-scan/stub';
import { AppError } from '../lib/errors';

const scanner = new StubAutoScanner();

export const creativesRouter = new Hono<Env>();
creativesRouter.use('*', requireAuth);

creativesRouter.post('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const body = await c.req.json();
  const cre = await createCreative(adv.id, body, scanner);
  return c.json({ creative: cre }, 201);
});

creativesRouter.get('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const list = await listCreativesForAdvertiser(adv.id);
  return c.json({ creatives: list });
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
  return c.json({ creative: cre });
});
