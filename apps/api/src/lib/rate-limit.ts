import { getRedis, isRedisConfigured } from './redis.js';

/**
 * AI-creative generation is split into two steps (creative-wizard, 2026-07-27
 * plan), each with its own daily bucket per advertiser:
 *  - `gen-copy`: SSRF-guarded extract + Gemini copy variants only (text,
 *    no rendering/uploads) — cheap enough per call to allow a generous
 *    20/day so the wizard's "Texti" step feels like a fast iteration loop.
 *  - `gen-render`: background-image generation (optional) + per-size SVG
 *    rendering + rasterization + Storage uploads — the expensive step, so
 *    it keeps the historical single `/generate` route's 10/day cap.
 */
export type RateLimitBucket = 'gen-copy' | 'gen-render';

const BUCKET_LIMITS: Record<RateLimitBucket, number> = {
  'gen-copy': 20,
  'gen-render': 10,
};

/**
 * Redis INCR+EXPIRE counter keyed `ratelimit:{bucket}:{advertiserId}:{YYYYMMDD}`,
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
 *
 * Buckets are independent counters (separate Redis keys) — exhausting
 * `gen-copy` never blocks `gen-render` and vice versa, since the two steps
 * have very different per-call costs and are used at different points in
 * the wizard flow.
 */
export async function checkGenerationRateLimit(
  bucket: RateLimitBucket,
  advertiserId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const limit = BUCKET_LIMITS[bucket];

  if (!isRedisConfigured()) {
    return { allowed: true, remaining: limit };
  }

  const day = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (UTC)
  const key = `ratelimit:${bucket}:${advertiserId}:${day}`;

  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 25 * 60 * 60); // outlives a UTC day comfortably
    }
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
    };
  } catch (err) {
    console.error(`checkGenerationRateLimit(${bucket}) error (failing closed):`, err);
    return { allowed: false, remaining: 0 };
  }
}
