import { drainAndAggregate } from '../dist/src/services/stats-aggregator.js';
import {
  alertCronFailure,
  recordHeartbeat,
  checkCronHeartbeats,
} from '../dist/src/services/ops-alerts.js';

export const config = { runtime: 'nodejs' };

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const total = [];
    // Drain up to 5 batches per cron run (5000 events max)
    for (let i = 0; i < 5; i++) {
      const n = await drainAndAggregate(1000);
      total.push(n);
      if (n === 0) break;
    }
    await recordHeartbeat('cron-aggregate');
    const watchdog = await checkCronHeartbeats();
    return new Response(JSON.stringify({ batches: total, staleCrons: watchdog.stale }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron-aggregate] Failed:', err);
    await alertCronFailure('cron-aggregate', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
