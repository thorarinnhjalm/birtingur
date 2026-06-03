import { createHmac, timingSafeEqual } from 'crypto';

export interface TeyaWebhookEvent {
  type: 'checkout.completed' | 'checkout.failed';
  data: {
    sessionId: string;
    amountIsk: number;
    metadata: { advertiserId: string };
  };
}

export function verifyTeyaSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseTeyaEvent(rawBody: string): TeyaWebhookEvent {
  const data = JSON.parse(rawBody) as TeyaWebhookEvent;
  if (data.type !== 'checkout.completed' && data.type !== 'checkout.failed') {
    throw new Error(`Unsupported event type: ${data.type}`);
  }
  return data;
}
