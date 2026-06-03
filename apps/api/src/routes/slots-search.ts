import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth';
import { searchSlots } from '../services/slot-search';

export const slotsSearchRouter = new Hono<Env>();
slotsSearchRouter.use('*', requireAuth);

slotsSearchRouter.get('/', async (c) => {
  const width = c.req.query('width');
  const height = c.req.query('height');
  const maxCpm = c.req.query('maxCpm');

  const slots = await searchSlots({
    width: width ? parseInt(width, 10) : undefined,
    height: height ? parseInt(height, 10) : undefined,
    maxCpm: maxCpm ? parseInt(maxCpm, 10) : undefined,
  });

  return c.json({ slots });
});
