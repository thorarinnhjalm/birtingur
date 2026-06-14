import { drainAndAggregate } from '../dist/src/services/stats-aggregator.js';

export const config = { runtime: 'nodejs' };

async function pingHeartbeat() {
  const url = process.env.HEARTBEAT_AGGREGATE_URL;
  if (!url) return;
  try {
    await fetch(url);
  } catch {
    // Heartbeat ping failure is non-fatal — don't mask the cron result.
  }
}

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
    await pingHeartbeat();
    return new Response(JSON.stringify({ batches: total }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron-aggregate] Failed:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
