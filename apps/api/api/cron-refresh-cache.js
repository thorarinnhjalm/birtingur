import { refreshAllActiveSlotCaches } from '../dist/src/services/cache-refresh.js';
import { sweepExpiredCampaigns } from '../dist/src/services/campaigns.js';
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
    // Sweep expired campaigns to `completed` BEFORE refreshing the cache, so
    // a campaign that just got swept is never re-cached as servable for this
    // tick — see sweepExpiredCampaigns in services/campaigns.ts.
    const sweptExpiredCampaigns = await sweepExpiredCampaigns();
    const refreshed = await refreshAllActiveSlotCaches();
    await recordHeartbeat('cron-refresh-cache');
    return new Response(JSON.stringify({ refreshed, sweptExpiredCampaigns }), {
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
