import { getRedis, isRedisConfigured } from './redis.js';

/** AI-creative generation calls Gemini (copy + optional image) and does server-side
 * rendering — cheap per call individually, but each is an external-API round trip
 * we pay for, so it's rate-limited per advertiser per day. */
const GENERATION_DAILY_LIMIT = 10;

/**
 * Redis INCR+EXPIRE counter keyed `ratelimit:gen:{advertiserId}:{YYYYMMDD}`,
 * modeled on `apps/serving/src/lib/fraud.ts`'s hourly rate limiter but with the
 * opposite failure mode: serving fails OPEN (never block ad delivery over a
 * Redis blip), while this control-plane endpoint calls a paid external API, so
 * it fails CLOSED — a Redis error refuses the request rather than risking an
 * unbounded number of Gemini calls.
 *
 * When Redis isn't configured at all (e.g. the API emulator test suite, which
 * only starts Firestore per CLAUDE.md), skip limiting entirely rather than
 * failing closed on every call — same reasoning `cron-accrue` uses for
 * Redis-optional paths: this is an auth-gated control-plane endpoint (not the
 * public serving hot path), so an unconfigured Redis is a known local/test
 * condition, not a security gap to fail closed over.
 */
export async function checkGenerationRateLimit(
  advertiserId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!isRedisConfigured()) {
    return { allowed: true, remaining: GENERATION_DAILY_LIMIT };
  }

  const day = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC)
  const key = `ratelimit:gen:${advertiserId}:${day}`;

  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 25 * 60 * 60); // outlives a UTC day comfortably
    }
    return {
      allowed: count <= GENERATION_DAILY_LIMIT,
      remaining: Math.max(0, GENERATION_DAILY_LIMIT - count),
    };
  } catch (err) {
    console.error('checkGenerationRateLimit error (failing closed):', err);
    return { allowed: false, remaining: 0 };
  }
}
