import { drainAndAggregate } from '../src/services/stats-aggregator';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  const total: number[] = [];
  // Drain up to 5 batches per cron run (5000 events max)
  for (let i = 0; i < 5; i++) {
    const n = await drainAndAggregate(1000);
    total.push(n);
    if (n === 0) break;
  }

  return new Response(JSON.stringify({ batches: total }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
