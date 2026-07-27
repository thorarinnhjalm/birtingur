import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../lib/auth.js';
import type { Env } from '../../lib/auth.js';
import {
  listPendingPayouts,
  markPayoutCompleted,
  generateMonthlyPayouts,
} from '../../services/payouts.js';
import { previewCronBlockReason } from '../../lib/preview-guard.js';

export const adminPayoutsRoutes = new Hono<Env>();
adminPayoutsRoutes.use('/*', requireAuth, requireAdmin);

adminPayoutsRoutes.get('/pending', async (c) => {
  const items = await listPendingPayouts();
  return c.json(items);
});

// Both routes below reach the same money-flow functions the cron-payouts
// preview guard protects (generateMonthlyPayouts / markPayoutCompleted), so
// they need the same fail-closed check — otherwise a preview deploy could
// mutate the shared production payouts data through the admin API even
// though the cron entrypoint itself refuses to. See lib/preview-guard.ts.
adminPayoutsRoutes.post('/generate', async (c) => {
  const blocked = previewCronBlockReason();
  if (blocked) {
    return c.json({ error: 'preview_blocked', reason: blocked }, 403);
  }
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
  const blocked = previewCronBlockReason();
  if (blocked) {
    return c.json({ error: 'preview_blocked', reason: blocked }, 403);
  }
  const id = c.req.param('id');
  const body = (await c.req.json()) as { bankReference: string };
  const updated = await markPayoutCompleted(id, body.bankReference);
  return c.json(updated);
});
