import { createHmac } from 'crypto';

function resolveSecret(): string {
  const secret = process.env.SIGNING_SECRET;
  if (secret) return secret;
  // Without a configured secret the HMAC key would be a publicly-known constant,
  // letting anyone forge click/impression signatures. Throw in production.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SIGNING_SECRET is required in production');
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

/**
 * Event kinds that claim a signature independently. One served ad carries ONE
 * signature (routes/ad.ts builds the impression pixel and the click URL from
 * the same `createSignature` call), so the replay guard must be namespaced per
 * kind: without this, the impression pixel firing after the viewability delay
 * burns the signature and the visitor's subsequent click is rejected as a
 * replay — the ad is paid for but never delivers a visit.
 */
export type SignatureKind = 'imp' | 'clk' | 'pv';

/**
 * Returns true if this signature is seen for the first time FOR THIS KIND;
 * false if it is a replay of the same kind.
 *
 * Note on deploy: keys written by the previous unnamespaced version (`seen:{sig}`)
 * are simply orphaned and expire on their own TTL (1h impressions, 24h clicks).
 * The only effect is that an event already counted right before the deploy can
 * be counted once more if it is replayed within its window.
 */
export async function claimSignatureOnce(
  sig: string,
  ttlSeconds: number,
  kind: SignatureKind,
): Promise<boolean> {
  if (!sig) return false;
  const res = await getRedis().set(`seen:${kind}:${sig}`, '1', { nx: true, ex: ttlSeconds });
  return res === 'OK';
}
