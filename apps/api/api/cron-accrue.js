import { drainAndAccrue } from '../dist/src/services/accrual.js';

export const config = { runtime: 'nodejs' };

async function pingHeartbeat() {
  const url = process.env.HEARTBEAT_ACCRUE_URL;
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
    const drained = await drainAndAccrue(500);
    await pingHeartbeat();
    return new Response(JSON.stringify({ drained }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron-accrue] Failed:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
