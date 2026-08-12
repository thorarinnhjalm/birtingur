import { EVENT_QUEUE_ACCRUAL, EVENT_QUEUE_STATS } from '@ada/shared';
import { getRedis, isRedisConfigured } from '../lib/redis.js';
import { createNotification } from './notifications.js';
import { sendOpsAlertEmail } from './mail.js';

/**
 * Ops alerting for the money-flow crons. Two mechanisms:
 *
 * 1. Failure alerts — the cron entrypoints call `alertOps()` from their catch
 *    blocks, so a throwing cron pages someone instead of only console.error.
 * 2. Dead-man's switch — every successful cron run records a Redis heartbeat;
 *    `checkCronHeartbeats()` alerts when a sibling cron has silently stopped
 *    firing (the failure mode alerts alone can't see: Vercel never invoking the
 *    function at all). TWO crons call it — cron-aggregate (hourly) and
 *    cron-refresh-cache (every 10 min) — deliberately, not redundantly: a
 *    watchdog hosted by a single cron goes quiet exactly when that cron dies,
 *    which is when it is needed. Duplicate calls are safe (alerts dedupe per
 *    cron name for 6h; the check only writes bootstrap heartbeats), and the
 *    10-minute caller is what keeps detection latency off the hourly schedule.
 *
 * Alerts fan out to email (Resend, console fallback) and an in-app admin
 * notification, deduped per cron for 6h via Redis so a stuck cron does not
 * page every 15 minutes. All paths are best-effort: alerting must never take
 * the cron it protects down with it.
 */

const HEARTBEAT_PREFIX = 'heartbeat:';
const ALERT_DEDUPE_PREFIX = 'alerted:';
const ALERT_DEDUPE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Backlog-growth watches, one per drained queue. Each compares the current
 * depth against the previous hourly reading (stored under `prevKey`,
 * overwritten every check — no TTL needed) and alerts when two consecutive
 * checks both show growth past `threshold`, while `guardCron`'s heartbeat is
 * fresh — a stale heartbeat means the cron is not running at all, which the
 * staleness alert already covers; this catches the opposite failure, a cron
 * that runs green but keeps falling behind.
 *
 * Thresholds: below them, a growing queue is normal traffic variance.
 * events:accrual drains every 15 min so 500 queued is already several runs
 * behind; events:stats drains hourly and legitimately accumulates a full
 * hour of traffic, so its floor matches the 5000 ops-diagnostics uses.
 */
const QUEUE_GROWTH_WATCHES = [
  {
    queueKey: EVENT_QUEUE_ACCRUAL,
    prevKey: 'queue_depth_prev:accrual',
    threshold: 500,
    guardCron: 'cron-accrue',
    dedupeKey: 'accrual-queue-growth',
    subject: 'Innheimtu-biðröð hleðst upp',
    message: (prev: number, depth: number) =>
      `events:accrual dýptin jókst úr ${prev} í ${depth} milli tveggja síðustu athugana, á meðan cron-accrue er enn að keyra — cronið heldur ekki í við álagið. Athugaðu Vercel logs, Redis og /api/cron-diagnostics.`,
  },
  {
    queueKey: EVENT_QUEUE_STATS,
    prevKey: 'queue_depth_prev:stats',
    threshold: 5000,
    guardCron: 'cron-aggregate',
    dedupeKey: 'stats-queue-growth',
    subject: 'Tölfræði-biðröð hleðst upp',
    message: (prev: number, depth: number) =>
      `events:stats dýptin jókst úr ${prev} í ${depth} milli tveggja síðustu athugana, á meðan cron-aggregate er enn að keyra — söfnunin heldur ekki í við álagið og tölur í viðmótinu dragast aftur úr. Athugaðu Vercel logs og /api/cron-diagnostics.`,
  },
] as const;

/** Staleness thresholds per cron: schedule interval + generous grace. */
export const CRON_STALENESS_MINUTES: Record<string, number> = {
  'cron-accrue': 45, // runs every 15 min
  'cron-refresh-cache': 30, // runs every 10 min
  'cron-aggregate': 130, // runs hourly
  'cron-payouts': 33 * 24 * 60, // runs monthly on the 1st
  'cron-reconcile': 26 * 60, // runs daily + 2h grace
};

/** Pure staleness partition — exported for tests. Missing (null) heartbeats
 *  are bootstrap state (first deploy), never stale. */
export function staleCrons(
  nowMs: number,
  heartbeats: Record<string, number | null>,
): { name: string; ageMinutes: number }[] {
  const stale: { name: string; ageMinutes: number }[] = [];
  for (const [name, ts] of Object.entries(heartbeats)) {
    if (ts == null) continue;
    const threshold = CRON_STALENESS_MINUTES[name];
    if (!threshold) continue;
    const ageMinutes = Math.floor((nowMs - ts) / 60_000);
    if (ageMinutes > threshold) stale.push({ name, ageMinutes });
  }
  return stale;
}

/** Record a successful cron run. Called at the end of every cron entrypoint. */
export async function recordHeartbeat(cronName: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    await getRedis().set(`${HEARTBEAT_PREFIX}${cronName}`, Date.now());
  } catch (err) {
    console.error(`[ops-alerts] failed to record heartbeat for ${cronName}:`, err);
  }
}

function opsRecipients(): string[] {
  const explicit = (process.env.OPS_ALERT_EMAILS || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return explicit;
}

/**
 * Fan an ops alert out to console, email, and in-app admin notifications.
 * Never throws.
 */
export async function alertOps(subject: string, message: string): Promise<void> {
  console.error(`[OPS ALERT] ${subject} — ${message}`);
  const recipients = opsRecipients();
  if (recipients.length === 0) {
    console.error('[ops-alerts] no OPS_ALERT_EMAILS/ADMIN_EMAILS configured — console only');
    return;
  }
  try {
    await sendOpsAlertEmail(recipients, subject, message);
  } catch (err) {
    console.error('[ops-alerts] alert email failed:', err);
  }
  for (const email of recipients) {
    try {
      await createNotification({
        userEmail: email,
        role: 'admin',
        type: 'error',
        title: subject,
        message,
      });
    } catch (err) {
      console.error(`[ops-alerts] admin notification to ${email} failed:`, err);
    }
  }
}

/** Failure alert for a cron catch block, deduped per cron. Never throws. */
export async function alertCronFailure(cronName: string, err: unknown): Promise<void> {
  try {
    if (await alreadyAlerted(cronName)) {
      console.error(`[ops-alerts] ${cronName} failure alert suppressed (deduped)`);
      return;
    }
    await alertOps(
      `Cron ${cronName} féll`,
      `${cronName} kastaði villu: ${String(err).slice(0, 500)}. Peningaflæðið gæti verið stopp — athugaðu Vercel logs og /api/cron-diagnostics.`,
    );
  } catch (alertErr) {
    console.error('[ops-alerts] alertCronFailure itself failed:', alertErr);
  }
}

/**
 * Dead-man's switch: read every cron heartbeat and alert on stale ones.
 * Missing heartbeats are initialized (bootstrap) instead of alerted, so a
 * fresh deploy starts the clock rather than paging immediately.
 */
export async function checkCronHeartbeats(opts?: {
  /** Whether to also run the events:accrual backlog-growth check below.
   *  Defaults to true (cron-aggregate, hourly).
   *
   *  cron-refresh-cache passes false, deliberately. That check compares this
   *  reading of the queue against the previous one, which only means "the cron
   *  is not keeping up" when the gap between readings spans several
   *  cron-accrue runs. cron-accrue runs every 15 minutes, so on the hourly
   *  cadence a rise really is a backlog; sampled every 10 minutes it would
   *  routinely catch the normal sawtooth (events pile up between runs, then
   *  drain) and page ops about a healthy system. Staleness detection has no
   *  such dependency on the interval, so the 10-minute caller takes that half
   *  and leaves the baseline to the hourly one. */
  includeQueueDepth?: boolean;
}): Promise<{ stale: string[] }> {
  const includeQueueDepth = opts?.includeQueueDepth ?? true;
  if (!isRedisConfigured()) return { stale: [] };
  const redis = getRedis();
  const names = Object.keys(CRON_STALENESS_MINUTES);
  const heartbeats: Record<string, number | null> = {};
  try {
    const values = await redis.mget<(number | string | null)[]>(
      ...names.map((n) => `${HEARTBEAT_PREFIX}${n}`),
    );
    names.forEach((n, i) => {
      const v = values[i];
      heartbeats[n] = v == null ? null : Number(v);
    });
  } catch (err) {
    console.error('[ops-alerts] heartbeat read failed:', err);
    return { stale: [] };
  }

  const now = Date.now();
  for (const name of names) {
    if (heartbeats[name] == null) {
      // Bootstrap: start the clock on first sight instead of alerting.
      try {
        await redis.set(`${HEARTBEAT_PREFIX}${name}`, now);
      } catch {
        /* best effort */
      }
    }
  }

  const stale = staleCrons(now, heartbeats);
  for (const s of stale) {
    if (await alreadyAlerted(s.name)) continue;
    await alertOps(
      `Cron ${s.name} hefur ekki keyrt í ${s.ageMinutes} mínútur`,
      `Síðasta heartbeat frá ${s.name} er ${s.ageMinutes} mínútna gamalt (þröskuldur ${CRON_STALENESS_MINUTES[s.name]} mín). Cron-ið virðist hafa hætt að keyra — athugaðu Vercel cron stillingar og logs.`,
    );
  }

  // Backlog-growth checks: an independent signal from staleness above, one
  // per drained queue — see QUEUE_GROWTH_WATCHES for the semantics. Each is
  // gated on having a real previous reading, so a cold start or a single busy
  // check never alerts on its own. events:stats joined 2026-08-12: it was the
  // only drained queue nothing watched over time, so an aggregator that ran
  // green while falling further behind every hour was invisible (the per-run
  // capped/timedOut alerts cover a single run, not slow multi-hour drift).
  if (includeQueueDepth) {
    for (const watch of QUEUE_GROWTH_WATCHES) {
      const guardStale = stale.some((s) => s.name === watch.guardCron);
      const depth = await redis.llen(watch.queueKey).catch(() => null);
      if (typeof depth !== 'number') continue;

      const prev: number | null = await redis
        .get<number | string>(watch.prevKey)
        .then((raw) => {
          const parsed = raw == null ? null : Number(raw);
          return parsed == null || Number.isNaN(parsed) ? null : parsed;
        })
        .catch(() => null); // absence of a baseline is never evidence of a problem

      if (
        prev != null &&
        depth > prev &&
        depth > watch.threshold &&
        !guardStale &&
        !(await alreadyAlerted(watch.dedupeKey))
      ) {
        await alertOps(watch.subject, watch.message(prev, depth));
      }

      try {
        await redis.set(watch.prevKey, depth);
      } catch (err) {
        // Best-effort like the rest of this module, but silent failure here
        // would leave the growth check permanently blind (every future call
        // sees prev == null and never re-establishes a baseline) with no
        // trace anywhere — log it so a persistent write failure is visible.
        console.error(`[ops-alerts] failed to record ${watch.prevKey} baseline:`, err);
      }
    }
  }

  return { stale: stale.map((s) => s.name) };
}

/**
 * Dedupe key for any alert, not just per-cron failures — exported so other
 * money-flow modules (e.g. services/accrual.ts, for its "this run billed
 * nothing net" alert) can reuse the same 6h dedupe window instead of paging
 * every 15 minutes for a condition that persists across runs.
 */
export async function alreadyAlerted(key: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    const res = await getRedis().set(`${ALERT_DEDUPE_PREFIX}${key}`, '1', {
      nx: true,
      ex: ALERT_DEDUPE_TTL_SECONDS,
    });
    // nx-set returns null/undefined when the key already existed.
    return res == null;
  } catch {
    return false; // if dedupe is unavailable, prefer alerting twice over never
  }
}
