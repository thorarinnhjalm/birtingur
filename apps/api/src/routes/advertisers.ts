import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth.js';
import { createAdvertiser, getAdvertiserByOwnerEmail } from '../services/advertisers.js';
import { getAdvertiserStats } from '../services/advertiser-stats.js';
import { getAiTips } from '../services/ai-advisor.js';
import { getWallet } from '../services/wallet.js';
import { AppError } from '../lib/errors.js';
import { listCampaignsForAdvertiser } from '../services/campaigns.js';

export const advertisersRouter = new Hono<Env>();
advertisersRouter.use('*', requireAuth);

advertisersRouter.post('/', async (c) => {
  const REGISTRATION_CLOSED = true; // Set to false to reopen registration
  if (REGISTRATION_CLOSED) {
    throw new AppError(
      403,
      'Skráning nýrra auglýsenda er tímabundið lokuð.',
      'REGISTRATION_CLOSED',
    );
  }

  const user = c.get('user');
  const body = await c.req.json();
  const adv = await createAdvertiser({ ownerEmail: user.email, ...body });
  return c.json(adv, 201);
});

advertisersRouter.get('/me', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  return c.json(adv);
});

advertisersRouter.get('/me/stats', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const queryTimeframe = c.req.query('timeframe');
  const timeframe = queryTimeframe === '30' ? 30 : 7;
  const stats = await getAdvertiserStats(adv.id, timeframe);
  return c.json(stats);
});

advertisersRouter.get('/me/ai-tips', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const [stats, wallet, campaigns] = await Promise.all([
    getAdvertiserStats(adv.id, 7),
    getWallet(adv.id),
    listCampaignsForAdvertiser(adv.id),
  ]);
  const ctr = stats.impressions > 0 ? (stats.clicks / stats.impressions) * 100 : 0;
  const activeCampaigns = campaigns.filter((camp) => camp.status === 'active').length;
  const tips = await getAiTips({
    impressions: stats.impressions,
    clicks: stats.clicks,
    ctr,
    spendIsk: stats.spendIsk,
    balanceIsk: wallet?.balanceIsk ?? 0,
    activeCampaigns,
    totalCampaigns: campaigns.length,
  });
  return c.json({ tips });
});
