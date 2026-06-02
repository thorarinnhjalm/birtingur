import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import type { Env } from '../lib/auth';
import { handleError, AppError } from '../lib/errors';
import { getPublisherByOwnerEmail } from '../services/publishers';
import { listPublisherQueue, publisherReview } from '../services/approvals';

export const publisherApprovalsRoutes = new Hono<Env>();
publisherApprovalsRoutes.use('/*', requireAuth);

publisherApprovalsRoutes.get('/pending-approvals', async (c) => {
  try {
    const user = c.get('user');
    const pub = await getPublisherByOwnerEmail(user.email);
    if (!pub) {
      throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
    }
    const items = await listPublisherQueue(pub.id);
    return c.json({ items });
  } catch (e) {
    return handleError(e, c);
  }
});

publisherApprovalsRoutes.post('/approvals/:campaignId', async (c) => {
  try {
    const user = c.get('user');
    const pub = await getPublisherByOwnerEmail(user.email);
    if (!pub) {
      throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
    }
    const campaignId = c.req.param('campaignId');
    const body = (await c.req.json()) as { action: 'approve' | 'reject'; reason?: string };
    const cmp = await publisherReview(pub.id, { campaignId, ...body });
    return c.json({ campaign: cmp });
  } catch (e) {
    return handleError(e, c);
  }
});
