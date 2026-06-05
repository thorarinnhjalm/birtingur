import { refreshAllActiveSlotCaches } from '../dist/src/services/cache-refresh.js';

export const config = { runtime: 'nodejs' };

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  const refreshed = await refreshAllActiveSlotCaches();

  return new Response(JSON.stringify({ refreshed }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
