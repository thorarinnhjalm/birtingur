import { createHmac } from 'crypto';

function resolveSecret(): string {
  const secret = process.env.SIGNING_SECRET;
  if (secret) return secret;
  // Without a configured secret the HMAC key would be a publicly-known constant,
  // letting anyone forge click/impression signatures. Fail fast in production.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SIGNING_SECRET environment variable is required in production');
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
