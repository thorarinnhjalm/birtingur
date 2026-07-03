import { drainAndAccrue } from '../dist/src/services/accrual.js';
import { alertCronFailure, recordHeartbeat } from '../dist/src/services/ops-alerts.js';

export const config = { runtime: 'nodejs' };

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const drained = await drainAndAccrue(500);
    await recordHeartbeat('cron-accrue');
    return new Response(JSON.stringify({ drained }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron-accrue] Failed:', err);
    await alertCronFailure('cron-accrue', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
