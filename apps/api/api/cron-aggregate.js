import { drainAndAggregateAll } from '../dist/src/services/stats-aggregator.js';
import {
  alertCronFailure,
  recordHeartbeat,
  checkCronHeartbeats,
} from '../dist/src/services/ops-alerts.js';
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
    // The batch loop and its wall-clock budget live in the service so they
    // are testable; this entrypoint stays a thin caller. Stopping early on
    // the deadline is what keeps a large backlog from being killed by
    // Vercel's 60s limit — a killed run records no heartbeat, and the
    // heartbeat watchdog below runs inside this very cron.
    const run = await drainAndAggregateAll();
    if (run.timedOut || run.capped) {
      // The response body goes nowhere on a Vercel cron, and the run still
      // records a healthy heartbeat — so without this line a permanently
      // behind-schedule aggregator is invisible. The ops card's events:stats
      // depth and oldest-event age are the other half of the same signal.
      console.warn(
        `[cron-aggregate] Left work in the queue: aggregated ${run.aggregated} in ${run.batches} batches (timedOut=${run.timedOut}, capped=${run.capped}).`,
      );
    }
    await recordHeartbeat('cron-aggregate');
    const watchdog = await checkCronHeartbeats();
    return new Response(JSON.stringify({ ...run, staleCrons: watchdog.stale }), {
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
