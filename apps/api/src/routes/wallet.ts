import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { requireAuth, type Env } from '../lib/auth';
import { getAdvertiserByOwnerEmail } from '../services/advertisers';
import { getWallet } from '../services/wallet';
import { StubTeyaClient, HttpTeyaClient } from '../services/teya';
import type { TeyaClient } from '../services/teya';
import { AppError } from '../lib/errors';

function getTeya(): TeyaClient {
  if (process.env.TEYA_API_KEY) return new HttpTeyaClient(process.env.TEYA_API_KEY);
  return new StubTeyaClient();
}

export const walletRouter = new Hono<Env>();
walletRouter.use('*', requireAuth);

walletRouter.get('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const w = await getWallet(adv.id);
  return c.json({ wallet: w });
});

walletRouter.post('/topup', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const body = (await c.req.json()) as { amountIsk: number };
  const teya = getTeya();
  const session = await teya.createCheckoutSession({
    advertiserId: adv.id,
    amountIsk: body.amountIsk,
    successUrl: `${process.env.APP_BASE_URL ?? 'https://app.adplatform.is'}/wallet?topup=success`,
    cancelUrl: `${process.env.APP_BASE_URL ?? 'https://app.adplatform.is'}/wallet?topup=cancelled`,
    idempotencyKey: randomBytes(12).toString('hex'),
  });
  return c.json({ checkoutUrl: session.url, sessionId: session.sessionId }, 201);
});
export default walletRouter;
