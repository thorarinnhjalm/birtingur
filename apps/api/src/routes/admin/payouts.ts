import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../lib/auth.js';
import type { Env } from '../../lib/auth.js';
import { listPendingPayouts, markPayoutCompleted } from '../../services/payouts.js';

export const adminPayoutsRoutes = new Hono<Env>();
adminPayoutsRoutes.use('/*', requireAuth, requireAdmin);

adminPayoutsRoutes.get('/pending', async (c) => {
  const items = await listPendingPayouts();
  return c.json({ payouts: items });
});

adminPayoutsRoutes.post('/:id/mark-completed', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as { bankReference: string };
  const updated = await markPayoutCompleted(id, body.bankReference);
  return c.json({ payout: updated });
});
