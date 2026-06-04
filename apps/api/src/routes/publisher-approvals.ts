import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import type { Env } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { getPublisherByOwnerEmail } from '../services/publishers.js';
import { listPublisherQueue, publisherReview } from '../services/approvals.js';

export const publisherApprovalsRoutes = new Hono<Env>();
publisherApprovalsRoutes.use('/*', requireAuth);

publisherApprovalsRoutes.get('/pending-approvals', async (c) => {
  const user = c.get('user');
  const pub = await getPublisherByOwnerEmail(user.email);
  if (!pub) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }
  const items = await listPublisherQueue(pub.id);
  return c.json({ items });
});

publisherApprovalsRoutes.post('/approvals/:campaignId', async (c) => {
  const user = c.get('user');
  const pub = await getPublisherByOwnerEmail(user.email);
  if (!pub) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }
  const campaignId = c.req.param('campaignId');
  const body = (await c.req.json()) as { action: 'approve' | 'reject'; reason?: string };
  const cmp = await publisherReview(pub.id, { campaignId, ...body });
  return c.json({ campaign: cmp });
});
