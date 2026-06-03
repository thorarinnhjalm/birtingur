import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth';
import { createAdvertiser, getAdvertiserByOwnerEmail } from '../services/advertisers';
import { getAdvertiserStats } from '../services/advertiser-stats';
import { AppError } from '../lib/errors';

export const advertisersRouter = new Hono<Env>();
advertisersRouter.use('*', requireAuth);

advertisersRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const adv = await createAdvertiser({ ownerEmail: user.email, ...body });
  return c.json({ advertiser: adv }, 201);
});

advertisersRouter.get('/me', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  return c.json({ advertiser: adv });
});

advertisersRouter.get('/me/stats', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const queryTimeframe = c.req.query('timeframe');
  const timeframe = queryTimeframe === '30' ? 30 : 7;
  const stats = await getAdvertiserStats(adv.id, timeframe);
  return c.json(stats);
});

