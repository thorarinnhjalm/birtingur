import { createHmac } from 'crypto';

const SECRET = process.env.SIGNING_SECRET ?? 'birtingur-default-signing-secret-key-12345';

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
