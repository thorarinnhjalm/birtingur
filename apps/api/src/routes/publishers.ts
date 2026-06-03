import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth';
import { createPublisher, getPublisherByOwnerEmail, updatePublisher } from '../services/publishers';
import { getPublisherStats } from '../services/publisher-stats';
import { AppError } from '../lib/errors';
import {
  getOrCreateWidgetKey,
  getWidgetKeyByTargetId,
  issueWidgetKey,
  revokeWidgetKey,
} from '../services/widget-keys.js';

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

  // Handle mapping from payoutDetails format to payoutMethod format
  let payoutMethod = body.payoutMethod;
  if (!payoutMethod && body.payoutDetails) {
    const { iban, kennitala, accountHolder } = body.payoutDetails;
    if (iban && kennitala && accountHolder) {
      payoutMethod = {
        type: 'bank',
        iban,
        kennitala,
        accountName: accountHolder,
      };
    }
  }

  // Ensure contentPolicy is defined
  const contentPolicy = body.contentPolicy || {
    blockedCategories: [],
    requireManualApproval: false,
  };

  const publisher = await createPublisher({
    ownerEmail: user.email,
    domain: body.domain,
    displayName: body.displayName,
    payoutMethod,
    contentPolicy,
  });

  // Automatically provision the default widget key
  await getOrCreateWidgetKey(user.email, 'publisher', publisher.id);

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

publishersRouter.get('/me/widget-key', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const keyRecord = await getOrCreateWidgetKey(user.email, 'publisher', publisher.id);
  return c.json({ key: keyRecord.key });
});

publishersRouter.post('/me/widget-key/rotate', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const existing = await getWidgetKeyByTargetId(publisher.id, 'publisher');
  if (existing) {
    await revokeWidgetKey(existing.id);
  }

  const newKey = await issueWidgetKey(user.email, 'publisher', publisher.id);
  return c.json({ key: newKey.key });
});
