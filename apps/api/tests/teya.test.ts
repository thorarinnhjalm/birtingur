import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyTeyaSignature, parseTeyaEvent } from '../src/services/teya/webhook';

describe('verifyTeyaSignature', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({
    type: 'checkout.completed',
    data: { sessionId: 's', amountIsk: 1, metadata: { advertiserId: 'a' } },
  });
  const sig = createHmac('sha256', secret).update(body).digest('hex');

  it('passes for valid signature', () => {
    expect(verifyTeyaSignature(body, sig, secret)).toBe(true);
  });

  it('fails for wrong signature', () => {
    expect(verifyTeyaSignature(body, 'a'.repeat(64), secret)).toBe(false);
  });

  it('fails for wrong secret', () => {
    expect(verifyTeyaSignature(body, sig, 'other')).toBe(false);
  });
});

describe('parseTeyaEvent', () => {
  it('parses checkout.completed', () => {
    const ev = parseTeyaEvent(
      JSON.stringify({
        type: 'checkout.completed',
        data: { sessionId: 's', amountIsk: 5000, metadata: { advertiserId: 'adv_a' } },
      }),
    );
    expect(ev.type).toBe('checkout.completed');
    expect(ev.data.amountIsk).toBe(5000);
  });

  it('throws on unsupported type', () => {
    expect(() => parseTeyaEvent(JSON.stringify({ type: 'other' }))).toThrow();
  });
});
