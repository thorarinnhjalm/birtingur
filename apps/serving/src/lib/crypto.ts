import { createHmac } from 'crypto';

function resolveSecret(): string {
  const secret = process.env.SIGNING_SECRET;
  if (secret) return secret;
  // Without a configured secret the HMAC key would be a publicly-known constant,
  // letting anyone forge click/impression signatures. Log warning in production.
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL WARNING: SIGNING_SECRET environment variable is missing in production. Please configure it in Vercel.');
    return 'birtingur-production-fallback-signing-secret-warning-please-configure-in-vercel';
  }
  return 'birtingur-dev-signing-secret-not-for-production';
}

const SECRET = resolveSecret();

export function createSignature(
  creativeId: string,
  slotId: string,
  token: string,
  ts: number,
): string {
  const data = `${creativeId}:${slotId}:${token}:${ts}`;
  return createHmac('sha256', SECRET).update(data).digest('hex');
}

export function verifySignature(
  creativeId: string,
  slotId: string,
  token: string,
  ts: number,
  sig: string,
): boolean {
  const expected = createSignature(creativeId, slotId, token, ts);
  return expected === sig;
}

import { getRedis } from './redis.js';

/** Returns true if this signature is seen for the first time; false if it is a replay. */
export async function claimSignatureOnce(sig: string, ttlSeconds: number): Promise<boolean> {
  if (!sig) return false;
  const res = await getRedis().set(`seen:${sig}`, '1', { nx: true, ex: ttlSeconds });
  return res === 'OK';
}
