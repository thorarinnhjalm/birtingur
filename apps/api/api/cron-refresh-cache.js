import { refreshAllActiveSlotCaches } from '../dist/src/services/cache-refresh.js';

export const config = { runtime: 'nodejs' };

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const refreshed = await refreshAllActiveSlotCaches();
    return new Response(JSON.stringify({ refreshed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron-refresh-cache] Failed:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
