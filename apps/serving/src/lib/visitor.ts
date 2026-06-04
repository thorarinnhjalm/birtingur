import { createHash, randomBytes } from 'crypto';
import { getRedis } from './redis.js';

export function hashVisitorToken(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

const COOKIE_NAME = '_adp_v';

export function getOrCreateVisitorToken(cookieHeader: string | undefined): string {
  if (cookieHeader) {
    const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_NAME}=`));
    if (match) {
      const value = match.slice(COOKIE_NAME.length + 1);
      // Valid tokens are 12 characters (hex randomBytes(6))
      if (/^[a-f0-9]{12}$/.test(value)) return value;
    }
  }
  return randomBytes(6).toString('hex');
}

export function setCookieHeader(token: string): string {
  // 90 days (7776000 seconds)
  return `${COOKIE_NAME}=${token}; Max-Age=7776000; Path=/; SameSite=None; Secure`;
}

export async function getVisitorImpressionsToday(token: string): Promise<Record<string, number>> {
  const key = `vimp:${token}:${todayKey()}`;
  const raw = await getRedis().hgetall<Record<string, string>>(key);
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = Number(v) || 0;
  }
  return out;
}

export async function recordVisitorImpression(token: string, creativeId: string): Promise<void> {
  const key = `vimp:${token}:${todayKey()}`;
  await getRedis().hincrby(key, creativeId, 1);
  await getRedis().expire(key, 86400 * 2); // expire in 2 days
}

function todayKey(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}
