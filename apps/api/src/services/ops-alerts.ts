import { EVENT_QUEUE_ACCRUAL } from '@ada/shared';
import { getRedis, isRedisConfigured } from '../lib/redis.js';
import { createNotification } from './notifications.js';
import { sendOpsAlertEmail } from './mail.js';

/**
 * Ops alerting for the money-flow crons. Two mechanisms:
 *
 * 1. Failure alerts — the cron entrypoints call `alertOps()` from their catch
 *    blocks, so a throwing cron pages someone instead of only console.error.
 * 2. Dead-man's switch — every successful cron run records a Redis heartbeat;
 *    the hourly cron-aggregate calls `checkCronHeartbeats()` to alert when a
 *    sibling cron has silently stopped firing (the failure mode alerts alone
 *    can't see: Vercel never invoking the function at all).
 *
 * Alerts fan out to email (Resend, console fallback) and an in-app admin
 * notification, deduped per cron for 6h via Redis so a stuck cron does not
 * page every 15 minutes. All paths are best-effort: alerting must never take
 * the cron it protects down with it.
 */

const HEARTBEAT_PREFIX = 'heartbeat:';
const ALERT_DEDUPE_PREFIX = 'alerted:';
const ALERT_DEDUPE_TTL_SECONDS = 6 * 60 * 60;

/** Previous events:accrual depth reading, so the next check can tell growth
 *  from shrinkage. Overwritten every check — no TTL needed. */
const QUEUE_DEPTH_PREV_ACCRUAL_KEY = 'queue_depth_prev:accrual';
/** Below this, a growing queue is just normal traffic variance, not backlog. */
const ACCRUAL_QUEUE_ALERT_THRESHOLD = 500;

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
export async function checkCronHeartbeats(): Promise<{ stale: string[] }> {
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

  // Backlog-growth check: an independent signal from staleness above. A
  // stale cron-accrue heartbeat means the cron isn't running at all
  // (already alerted on above); this instead catches the opposite failure
  // mode from the previous task's changes — the cron IS running (fresh
  // heartbeat) but keeps falling behind, so events:accrual grows tick over
  // tick instead of draining. Gated on cron-accrue not being stale so this
  // never fires as a redundant echo of the staleness alert, and gated on
  // having a real previous reading so a cold start or a single busy check
  // never alerts on its own — only two consecutive checks that both show
  // growth, past a floor that rules out ordinary traffic variance.
  const accrueStale = stale.some((s) => s.name === 'cron-accrue');
  const depth = await redis.llen(EVENT_QUEUE_ACCRUAL).catch(() => null);
  if (typeof depth === 'number') {
    const prev: number | null = await redis
      .get<number | string>(QUEUE_DEPTH_PREV_ACCRUAL_KEY)
      .then((raw) => {
        const parsed = raw == null ? null : Number(raw);
        return parsed == null || Number.isNaN(parsed) ? null : parsed;
      })
      .catch(() => null); // absence of a baseline is never evidence of a problem

    if (
      prev != null &&
      depth > prev &&
      depth > ACCRUAL_QUEUE_ALERT_THRESHOLD &&
      !accrueStale &&
      !(await alreadyAlerted('accrual-queue-growth'))
    ) {
      await alertOps(
        'Innheimtu-biðröð hleðst upp',
        `events:accrual dýptin jókst úr ${prev} í ${depth} milli tveggja síðustu athugana, á meðan cron-accrue er enn að keyra — cronið heldur ekki í við álagið. Athugaðu Vercel logs, Redis og /api/cron-diagnostics.`,
      );
    }

    try {
      await redis.set(QUEUE_DEPTH_PREV_ACCRUAL_KEY, depth);
    } catch (err) {
      // Best-effort like the rest of this module, but silent failure here
      // would leave the growth check permanently blind (every future call
      // sees prev == null and never re-establishes a baseline) with no
      // trace anywhere — log it so a persistent write failure is visible.
      console.error('[ops-alerts] failed to record accrual queue depth baseline:', err);
    }
  }

  return { stale: stale.map((s) => s.name) };
}

async function alreadyAlerted(cronName: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    const res = await getRedis().set(`${ALERT_DEDUPE_PREFIX}${cronName}`, '1', {
      nx: true,
      ex: ALERT_DEDUPE_TTL_SECONDS,
    });
    // nx-set returns null/undefined when the key already existed.
    return res == null;
  } catch {
    return false; // if dedupe is unavailable, prefer alerting twice over never
  }
}
