import { generateMonthlyPayouts } from '../dist/src/services/payouts.js';
import { alertCronFailure, recordHeartbeat } from '../dist/src/services/ops-alerts.js';
import { previewCronBlockReason } from '../dist/src/lib/preview-guard.js';

export const config = { runtime: 'nodejs' };

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  const blocked = previewCronBlockReason();
  if (blocked) {
    return new Response(JSON.stringify({ error: 'preview_blocked', reason: blocked }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Run on the 1st of month; period is the previous month
    const now = new Date();
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const created = await generateMonthlyPayouts(periodStart, periodEnd);

    await recordHeartbeat('cron-payouts');
    return new Response(JSON.stringify({ created: created.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron-payouts] Failed:', err);
    await alertCronFailure('cron-payouts', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
