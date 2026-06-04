import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../lib/auth.js';
import type { Env } from '../../lib/auth.js';
import {
  listPendingPayouts,
  markPayoutCompleted,
  generateMonthlyPayouts,
} from '../../services/payouts.js';

export const adminPayoutsRoutes = new Hono<Env>();
adminPayoutsRoutes.use('/*', requireAuth, requireAdmin);

adminPayoutsRoutes.get('/pending', async (c) => {
  const items = await listPendingPayouts();
  return c.json({ payouts: items });
});

adminPayoutsRoutes.post('/generate', async (c) => {
  const body = (await c.req.json()) as { periodStart: string; periodEnd: string };
  if (!body.periodStart || !body.periodEnd) {
    return c.json({ error: 'Missing periodStart or periodEnd' }, 400);
  }
  const start = new Date(body.periodStart);
  const end = new Date(body.periodEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return c.json({ error: 'Invalid date range' }, 400);
  }
  const created = await generateMonthlyPayouts(start, end);
  return c.json({ created: created.length });
});

adminPayoutsRoutes.post('/:id/mark-completed', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as { bankReference: string };
  const updated = await markPayoutCompleted(id, body.bankReference);
  return c.json({ payout: updated });
});
