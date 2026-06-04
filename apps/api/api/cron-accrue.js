import { drainAndAccrue } from '../dist/src/services/accrual.js';

export const config = { runtime: 'nodejs' };

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  const drained = await drainAndAccrue(500);

  return new Response(JSON.stringify({ drained }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
