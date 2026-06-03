import { Hono } from 'hono';
import { requireAdmin, requireAuth, type Env } from '../../lib/auth';
import { getAdminStats } from '../../services/admin-stats';
import { adminReviewRoutes } from './review';
import { adminPayoutsRoutes } from './payouts';

export const adminRoutes = new Hono<Env>();

// Require admin access on all admin sub-routes
adminRoutes.use('/*', requireAuth, requireAdmin);

adminRoutes.route('/review-queue', adminReviewRoutes);
adminRoutes.route('/payouts', adminPayoutsRoutes);

adminRoutes.get('/stats', async (c) => {
  const stats = await getAdminStats();
  return c.json({ stats });
});
