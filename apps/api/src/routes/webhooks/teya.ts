import { Hono } from 'hono';
import { parseTeyaEvent, verifyTeyaSignature } from '../../services/teya/webhook';
import { topUp } from '../../services/wallet';

export const teyaWebhookRoute = new Hono();

teyaWebhookRoute.post('/', async (c) => {
  const secret = process.env.TEYA_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: 'webhook_misconfigured' }, 500);
  }

  const sig = c.req.header('Teya-Signature') ?? '';
  const raw = await c.req.text();

  if (!verifyTeyaSignature(raw, sig, secret)) {
    return c.json({ error: 'invalid_signature' }, 401);
  }

  let event;
  try {
    event = parseTeyaEvent(raw);
  } catch (e) {
    return c.json({ error: 'bad_event', message: String(e) }, 400);
  }

  if (event.type === 'checkout.completed') {
    await topUp(event.data.metadata.advertiserId, event.data.amountIsk, event.data.sessionId);
  }

  return c.json({ ok: true });
});

export default teyaWebhookRoute;
