import { collectOpsDiagnostics } from '../dist/src/services/ops-diagnostics.js';

export const config = { runtime: 'nodejs' };

// On-demand ops health check — no schedule, safe to hit on any deploy.
// The logic lives in services/ops-diagnostics.ts so the admin dashboard can
// render the same picture behind ordinary admin auth (GET /v1/admin/ops),
// instead of ops health being reachable only by pasting CRON_SECRET into a
// terminal. This entrypoint keeps the CRON_SECRET gate for scripted checks.
//
// It used to inline its own Redis/Firestore probing, including a hardcoded
// lookup of one publisher's stats doc left over from a specific incident —
// which reported on that publisher forever and on nobody else.
export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const diagnostics = await collectOpsDiagnostics();
    return new Response(JSON.stringify(diagnostics, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron-diagnostics] Failed:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
