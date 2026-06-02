import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../lib/auth';
import type { Env } from '../../lib/auth';
import { handleError } from '../../lib/errors';
import { adminReview, listAdminQueue } from '../../services/approvals';

export const adminReviewRoutes = new Hono<Env>();
adminReviewRoutes.use('/*', requireAuth, requireAdmin);

adminReviewRoutes.get('/queue', async (c) => {
  try {
    const list = await listAdminQueue(50);
    return c.json({ queue: list });
  } catch (e) {
    return handleError(e, c);
  }
});

adminReviewRoutes.post('/:id', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = (await c.req.json()) as { action: 'approve' | 'reject'; reason?: string };
    const updated = await adminReview(id, { ...body, adminEmail: user.email });
    return c.json({ creative: updated });
  } catch (e) {
    return handleError(e, c);
  }
});
