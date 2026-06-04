import { Hono } from 'hono';
import { verifyWidgetKey, type WidgetKeyRecord } from '../services/widget-keys.js';
import { getPublisherStats } from '../services/publisher-stats.js';
import { listPublisherQueue, publisherReview } from '../services/approvals.js';
import { getCampaignStats } from '../services/campaign-stats.js';
import { AppError } from '../lib/errors.js';

export interface WidgetEnv {
  Variables: {
    widgetKey: WidgetKeyRecord;
  };
}

export const widgetsRouter = new Hono<WidgetEnv>();

// Scoped Auth Middleware for Widget Keys
widgetsRouter.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(
      401,
      'Unauthorized: Missing or invalid Authorization header',
      'UNAUTHORIZED',
    );
  }
  const token = authHeader.substring(7).trim();
  const record = await verifyWidgetKey(token);
  if (!record) {
    throw new AppError(401, 'Unauthorized: Invalid or revoked widget key', 'UNAUTHORIZED');
  }
  c.set('widgetKey', record);
  await next();
});

// Publisher Stats Widget Endpoint
widgetsRouter.get('/publisher/stats', async (c) => {
  const record = c.get('widgetKey');
  if (record.type !== 'publisher') {
    throw new AppError(403, 'Forbidden: Key does not have publisher scope', 'FORBIDDEN');
  }
  const queryTimeframe = c.req.query('timeframe');
  const timeframe = queryTimeframe === '30' ? 30 : 7;
  const stats = await getPublisherStats(record.targetId, timeframe);
  return c.json(stats);
});

// Publisher Pending Approvals Queue Widget Endpoint
widgetsRouter.get('/publisher/pending-approvals', async (c) => {
  const record = c.get('widgetKey');
  if (record.type !== 'publisher') {
    throw new AppError(403, 'Forbidden: Key does not have publisher scope', 'FORBIDDEN');
  }
  const rawItems = await listPublisherQueue(record.targetId);
  const items = rawItems.map((item) => ({
    campaignId: item.campaign.id,
    advertiserName: item.campaign.advertiserId, // Display advertiserId as advertiserName
    creative: {
      creativeId: item.creative.id,
      imageUrl: item.creative.imageUrl,
      width: item.creative.width,
      height: item.creative.height,
      clickUrl: item.creative.clickUrl,
    },
    budget: {
      mode: item.campaign.budget.mode,
      totalIsk: item.campaign.budget.totalIsk,
    },
  }));
  return c.json({ items });
});

// Publisher Approvals Processing Widget Endpoint
widgetsRouter.post('/publisher/approvals/:campaignId', async (c) => {
  const record = c.get('widgetKey');
  if (record.type !== 'publisher') {
    throw new AppError(403, 'Forbidden: Key does not have publisher scope', 'FORBIDDEN');
  }
  const campaignId = c.req.param('campaignId');
  const body = (await c.req.json().catch(() => ({}))) as {
    action: 'approve' | 'reject';
    reason?: string;
  };
  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    throw new AppError(400, 'Invalid action', 'BAD_REQUEST');
  }
  const cmp = await publisherReview(record.targetId, { campaignId, ...body });
  return c.json({ campaign: cmp });
});

// Campaign Stats Widget Endpoint
widgetsRouter.get('/campaign/stats', async (c) => {
  const record = c.get('widgetKey');
  if (record.type !== 'campaign') {
    throw new AppError(403, 'Forbidden: Key does not have campaign scope', 'FORBIDDEN');
  }
  const stats = await getCampaignStats(record.targetId);
  return c.json({ stats });
});
