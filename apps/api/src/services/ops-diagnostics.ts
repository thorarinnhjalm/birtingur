import { getRedis, isRedisConfigured } from '../lib/redis.js';
import { EVENT_QUEUE_STATS, EVENT_QUEUE_ACCRUAL, EVENT_QUEUE_LEGACY } from '@ada/shared';
import { CRON_STALENESS_MINUTES, staleCrons } from './ops-alerts.js';

/**
 * Everything needed to answer "is the money pipeline actually running?".
 *
 * This used to exist only inside the `api/cron-diagnostics.js` entrypoint,
 * gated on `CRON_SECRET` — which meant the only way to see it was to paste a
 * production secret into a terminal. The logic lives here now so the admin
 * dashboard can render it behind ordinary admin auth, and the cron
 * entrypoint stays a thin caller.
 *
 * Read-only: it never writes a heartbeat, drains a queue, or alerts.
 */

export interface CronHealth {
  name: string;
  /** null = never recorded. Bootstrap state on a fresh deploy, not a fault. */
  ageMinutes: number | null;
  stalenessThresholdMinutes: number;
  stale: boolean;
}

export interface OpsDiagnostics {
  checkedAt: string;
  redis:
    | { status: 'unconfigured' }
    | { status: 'error'; message: string }
    | {
        status: 'ok';
        queues: { stats: number; accrual: number; legacy: number };
        /** Age of the oldest queued event, or null when the queue is empty. */
        oldestStatsEventAgeSeconds: number | null;
      };
  crons: CronHealth[];
  /** Presence only — never the values. */
  env: Record<string, boolean>;
  /** Overall verdict, so the UI doesn't have to re-derive it. */
  healthy: boolean;
  problems: string[];
}

const CRON_NAMES = Object.keys(CRON_STALENESS_MINUTES);

/** Depth past which `events:accrual` is a backlog rather than normal traffic. */
const ACCRUAL_BACKLOG_THRESHOLD = 500;

/**
 * Depth past which `events:stats` is a backlog: one `cron-aggregate` run
 * clears at most `maxBatches × batchSize` = 5000 events, so anything above
 * that is a queue the hourly cron cannot catch up with in a single run.
 */
const STATS_BACKLOG_THRESHOLD = 5000;

/**
 * An hourly cron should never leave an event waiting three hours. This is the
 * signal a depth check alone cannot give: `cron-aggregate` now degrades to
 * "drain less this run" instead of timing out, which is the right behaviour
 * but is silent — a run that quietly leaves work behind every hour records a
 * perfectly fresh heartbeat.
 */
const STATS_OLDEST_AGE_ALERT_SECONDS = 3 * 60 * 60;

function envPresence(): Record<string, boolean> {
  return {
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    REDIS: isRedisConfigured(),
    FIREBASE_PROJECT_ID: Boolean(process.env.FIREBASE_PROJECT_ID),
    FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    // SIGNING_SECRET is deliberately absent: it belongs to apps/serving, a
    // separate Vercel project with its own environment. Nothing in apps/api
    // reads it, so reporting it here only ever produced a permanent red
    // "SIGNING_SECRET vantar" on the admin ops card that no API-side change
    // could clear.
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
  };
}

export async function collectOpsDiagnostics(): Promise<OpsDiagnostics> {
  const now = Date.now();
  const env = envPresence();
  const problems: string[] = [];

  if (!isRedisConfigured()) {
    return {
      checkedAt: new Date(now).toISOString(),
      redis: { status: 'unconfigured' },
      crons: CRON_NAMES.map((name) => ({
        name,
        ageMinutes: null,
        stalenessThresholdMinutes: CRON_STALENESS_MINUTES[name]!,
        stale: false,
      })),
      env,
      healthy: false,
      problems: ['Redis er ekki stillt, svo hvorki biðraðir né cron-púls eru mælanleg.'],
    };
  }

  const redis = getRedis();

  let redisResult: OpsDiagnostics['redis'];
  let heartbeats: Record<string, number | null> = Object.fromEntries(
    CRON_NAMES.map((n) => [n, null]),
  );

  try {
    const [statsLen, accrualLen, legacyLen, hbVals, oldestRaw] = await Promise.all([
      redis.llen(EVENT_QUEUE_STATS),
      redis.llen(EVENT_QUEUE_ACCRUAL),
      redis.llen(EVENT_QUEUE_LEGACY),
      redis.mget<(string | number | null)[]>(...CRON_NAMES.map((n) => `heartbeat:${n}`)),
      // Index -1 is the tail: events are pushed with lpush, so the tail is
      // the oldest one still waiting. Its age is the real backlog signal —
      // a deep queue that is draining fast is fine, a shallow one stuck for
      // an hour is not.
      redis.lindex(EVENT_QUEUE_STATS, -1),
    ]);

    heartbeats = Object.fromEntries(
      CRON_NAMES.map((n, i) => {
        const raw = hbVals?.[i];
        return [n, raw == null ? null : Number(raw)];
      }),
    );

    let oldestStatsEventAgeSeconds: number | null = null;
    if (oldestRaw != null) {
      try {
        const parsed = typeof oldestRaw === 'string' ? JSON.parse(oldestRaw) : oldestRaw;
        const ts = (parsed as { ts?: number })?.ts;
        if (typeof ts === 'number') {
          oldestStatsEventAgeSeconds = Math.max(0, Math.round((now - ts) / 1000));
        }
      } catch {
        /* a malformed entry tells us nothing about age; leave it null */
      }
    }

    redisResult = {
      status: 'ok',
      queues: { stats: statsLen, accrual: accrualLen, legacy: legacyLen },
      oldestStatsEventAgeSeconds,
    };

    if (statsLen > STATS_BACKLOG_THRESHOLD) {
      problems.push(
        `Tölfræðibiðröðin (events:stats) er með ${statsLen} atburði í bið, meira en cron-aggregate nær í einni keyrslu.`,
      );
    }
    if (
      oldestStatsEventAgeSeconds !== null &&
      oldestStatsEventAgeSeconds > STATS_OLDEST_AGE_ALERT_SECONDS
    ) {
      problems.push(
        `Elsti atburðurinn í events:stats hefur beðið í ${Math.round(oldestStatsEventAgeSeconds / 3600)} klst. Cron-aggregate hefur ekki undan.`,
      );
    }
    if (accrualLen > ACCRUAL_BACKLOG_THRESHOLD) {
      problems.push(
        `Uppsöfnunarbiðröðin (events:accrual) er með ${accrualLen} atburði í bið, sem bendir til að cron-accrue sé ekki að tæma hana.`,
      );
    }
    if (legacyLen > 0) {
      problems.push(
        `Gamla biðröðin (events:queue) er ekki tóm (${legacyLen}). Hún á að vera tæmd fyrir fullt og allt.`,
      );
    }
  } catch (err) {
    redisResult = { status: 'error', message: err instanceof Error ? err.message : String(err) };
    problems.push('Ekki náðist samband við Redis.');
  }

  const stale = new Map(staleCrons(now, heartbeats).map((s) => [s.name, s.ageMinutes]));
  const crons: CronHealth[] = CRON_NAMES.map((name) => ({
    name,
    ageMinutes: heartbeats[name] == null ? null : Math.floor((now - heartbeats[name]!) / 60_000),
    stalenessThresholdMinutes: CRON_STALENESS_MINUTES[name]!,
    stale: stale.has(name),
  }));

  for (const [name, ageMinutes] of stale) {
    problems.push(`${name} hefur ekki keyrt í ${ageMinutes} mínútur.`);
  }

  for (const [key, present] of Object.entries(env)) {
    // Only the vars whose absence breaks the money flow are treated as
    // problems; the optional ones degrade to a documented fallback.
    if (!present && ['CRON_SECRET', 'REDIS', 'FIREBASE_PRIVATE_KEY'].includes(key)) {
      problems.push(`${key} vantar í umhverfið.`);
    }
  }

  return {
    checkedAt: new Date(now).toISOString(),
    redis: redisResult,
    crons,
    env,
    healthy: problems.length === 0,
    problems,
  };
}
