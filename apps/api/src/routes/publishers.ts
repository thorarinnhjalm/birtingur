import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth';
import {
  createPublisher,
  getPublisherByOwnerEmail,
  updatePublisher,
} from '../services/publishers';
import { getPublisherStats } from '../services/publisher-stats';
import { AppError } from '../lib/errors';

export const publishersRouter = new Hono<Env>();

// Apply authentication middleware to all publisher routes
publishersRouter.use('*', requireAuth);

publishersRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // Check if publisher already exists
  const existing = await getPublisherByOwnerEmail(user.email);
  if (existing) {
    throw new AppError(409, 'Publisher profile already exists for this user email', 'CONFLICT');
  }

  const publisher = await createPublisher({
    ownerEmail: user.email,
    domain: body.domain,
    displayName: body.displayName,
    payoutMethod: body.payoutMethod,
    contentPolicy: body.contentPolicy,
  });

  return c.json(publisher, 201);
});

publishersRouter.get('/me', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);
  
  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  return c.json(publisher);
});

publishersRouter.patch('/me', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const body = await c.req.json();
  const updated = await updatePublisher(publisher.id, body);

  return c.json(updated);
});

publishersRouter.get('/me/stats', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const queryTimeframe = c.req.query('timeframe');
  const timeframe = queryTimeframe === '30' ? 30 : 7;

  const stats = await getPublisherStats(publisher.id, timeframe);
  return c.json(stats);
});
