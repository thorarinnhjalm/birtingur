import { getRedis } from './redis.js';

/**
 * Checks if a click is a duplicate (within 30 seconds of a previous click by the same IP for this creative).
 * Set an NX lock for 30s. If the lock was already set, returns true (duplicated).
 */
export async function isClickDeduplicated(creativeId: string, ip: string): Promise<boolean> {
  try {
    const key = `click_dedup:${creativeId}:${ip}`;
    const result = await getRedis().set(key, '1', { nx: true, ex: 30 });
    return result === null;
  } catch (err) {
    console.error('isClickDeduplicated error:', err);
    return false; // Fail-open: proceed with counting if Redis is down
  }
}

/**
 * Checks if a visitor IP is under the hourly rate limit of clicks/impressions for a campaign.
 * Thresholds: 3 clicks/hour, 30 impressions/hour.
 * Returns true if under limit, false if limit exceeded.
 */
export async function checkAndIncrementRateLimit(
  campaignId: string,
  ip: string,
  type: 'impression' | 'click',
): Promise<boolean> {
  const threshold = type === 'impression' ? 30 : 3;
  try {
    const hourKey = new Date().toISOString().slice(0, 13).replace(/[-T]/g, ''); // YYYYMMDDHH (UTC)
    const key = `rate_limit:${type}:${campaignId}:${ip}:${hourKey}`;
    const redis = getRedis();

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 3600);
    }

    return count <= threshold;
  } catch (err) {
    console.error('checkAndIncrementRateLimit error:', err);
    return true; // Fail-open: proceed with counting if Redis is down
  }
}
