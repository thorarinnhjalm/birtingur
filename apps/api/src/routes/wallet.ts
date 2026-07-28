import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { URL } from 'url';
import { requireAuth, requireScope, type Env } from '../lib/auth.js';
import { getAdvertiserByOwnerEmail } from '../services/advertisers.js';
import { getWallet, getAvailableBalance } from '../services/wallet.js';
import { StubTeyaClient, HttpTeyaClient } from '../services/teya/index.js';
import type { TeyaClient } from '../services/teya/index.js';
import { AppError } from '../lib/errors.js';
import { db } from '../lib/firebase.js';
import { COLLECTIONS } from '@ada/shared/firestore';

function getTeya(): TeyaClient {
  if (process.env.TEYA_API_KEY) return new HttpTeyaClient(process.env.TEYA_API_KEY);
  // The stub credits wallets without charging a card, so it must be an
  // explicit opt-in — a prod deploy missing TEYA_API_KEY has to fail loudly,
  // not silently hand out balance.
  if (process.env.TEYA_STUB === 'true') return new StubTeyaClient();
  throw new AppError(503, 'Payment provider is not configured', 'TEYA_NOT_CONFIGURED');
}

export const walletRouter = new Hono<Env>();
walletRouter.use('*', requireAuth);
walletRouter.use('*', requireScope('advertiser'));

walletRouter.get('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const w = await getWallet(adv.id);
  const { committedIsk, availableIsk } = await getAvailableBalance(adv.id);
  return c.json({ ...w, committedIsk, availableIsk });
});

walletRouter.get('/transactions', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }

  const snap = await db.collection(COLLECTIONS.ledger).where('party.id', '==', adv.id).get();

  const txs = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        amountIsk: data.amountIsk,
        relatedId: data.relatedId,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    })
    .filter((tx) => tx.type === 'topup' || tx.type === 'refund')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return c.json(txs);
});

walletRouter.post('/topup', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const body = (await c.req.json()) as { amountIsk: number };
  const teya = getTeya();

  // Only honour the referer origin if it belongs to a trusted host, otherwise an
  // attacker-supplied referer could redirect the post-payment flow anywhere.
  const referer = c.req.header('referer');
  let baseUrl = process.env.APP_BASE_URL ?? 'https://app.birtingur.app';
  if (referer) {
    try {
      const url = new URL(referer);
      const host = url.hostname;
      const trusted =
        host === 'birtingur.app' || host.endsWith('.birtingur.app') || host === 'localhost';
      if (trusted) {
        baseUrl = url.origin;
      }
    } catch {
      // ignore, use fallback
    }
  }

  const session = await teya.createCheckoutSession({
    advertiserId: adv.id,
    amountIsk: body.amountIsk,
    successUrl: `${baseUrl}/advertiser/topup?success=true`,
    cancelUrl: `${baseUrl}/advertiser/topup?cancelled=true`,
    idempotencyKey: randomBytes(12).toString('hex'),
  });
  return c.json({ checkoutUrl: session.url, sessionId: session.sessionId }, 201);
});
export default walletRouter;
