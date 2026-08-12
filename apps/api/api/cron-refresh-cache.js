import { refreshAllActiveSlotCaches } from '../dist/src/services/cache-refresh.js';
import { sweepExpiredCampaigns } from '../dist/src/services/campaigns.js';
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
    // Sweep expired campaigns to `completed` BEFORE refreshing the cache, so
    // a campaign that just got swept is never re-cached as servable for this
    // tick — see sweepExpiredCampaigns in services/campaigns.ts.
    //
    // The sweep is isolated: refreshing the cache is the load-bearing half of
    // this cron (`budget:{id}` keys carry a 1h TTL and the serve-time gate is
    // fail-closed, so skipping a refresh stops all ads within the hour),
    // whereas a missed sweep only delays releasing a fund hold until the next
    // tick. Never let the cheap half take down the critical one.
    let sweptExpiredCampaigns = 0;
    let sweepError = null;
    try {
      sweptExpiredCampaigns = await sweepExpiredCampaigns();
    } catch (err) {
      sweepError = err;
      console.error('[cron-refresh-cache] sweep failed, continuing to cache refresh:', err);
    }

    const refreshed = await refreshAllActiveSlotCaches();

    if (sweepError) {
      await alertCronFailure('cron-refresh-cache-sweep', sweepError);
    }
    await recordHeartbeat('cron-refresh-cache');

    // Second caller of the dead-man's switch, alongside cron-aggregate. Not a
    // move: whichever single cron hosts the watchdog, that cron dying takes the
    // watchdog with it and every other cron can then fail silently. Two hosts
    // close that for the pair, and duplicate calls are harmless — staleness
    // alerts dedupe per cron name for 6h and the check is read-only apart from
    // bootstrap writes. Running here every 10 min instead of hourly also cuts
    // detection latency for the other crons. Isolated like the sweep above: the
    // load-bearing half of this cron is the cache refresh, so a failing
    // watchdog must never take it down.
    //
    // Staleness only: the events:accrual growth check stays on cron-aggregate's
    // hourly cadence, because it compares consecutive readings and a 10-minute
    // gap would flag the normal pile-up-then-drain between cron-accrue runs.
    // See the includeQueueDepth note in services/ops-alerts.ts.
    let staleCrons = [];
    try {
      staleCrons = (await checkCronHeartbeats({ includeQueueDepth: false })).stale;
    } catch (err) {
      console.error('[cron-refresh-cache] heartbeat watchdog failed:', err);
    }
    return new Response(JSON.stringify({ refreshed, sweptExpiredCampaigns, staleCrons }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron-refresh-cache] Failed:', err);
    await alertCronFailure('cron-refresh-cache', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
