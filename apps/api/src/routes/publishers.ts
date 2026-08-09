import { Hono } from 'hono';
import { requireAuth, requireScope, type Env } from '../lib/auth.js';
import {
  createPublisher,
  getPublisherByOwnerEmail,
  getPublishersByOwnerEmail,
  getPublisherByDomain,
  updatePublisher,
} from '../services/publishers.js';
import { getPublisherStats, getAggregatedPublisherStats } from '../services/publisher-stats.js';
import { AppError } from '../lib/errors.js';
import { scrapeAndClassifyDomain } from '../services/domain-classifier.js';
import {
  getOrCreateWidgetKey,
  getWidgetKeyByTargetId,
  issueWidgetKey,
  revokeWidgetKey,
} from '../services/widget-keys.js';
import { listPublisherPayouts, getUnpaidBasisIsk } from '../services/payouts.js';
import { MIN_PAYOUT_ISK } from '@ada/shared';

export const publishersRouter = new Hono<Env>();

// Apply authentication middleware to all publisher routes
publishersRouter.use('*', requireAuth);
publishersRouter.use('*', requireScope('publisher'));

publishersRouter.get('/all', async (c) => {
  const user = c.get('user');
  const publishers = await getPublishersByOwnerEmail(user.email);
  return c.json(publishers);
});

publishersRouter.get('/stats', async (c) => {
  const user = c.get('user');
  const publishers = await getPublishersByOwnerEmail(user.email);

  const queryTimeframe = c.req.query('timeframe');
  const timeframe = queryTimeframe === '30' ? 30 : 7;

  const publisherId = c.req.query('publisherId');
  if (publisherId) {
    if (!publishers.some((p) => p.id === publisherId)) {
      throw new AppError(403, 'Publisher does not belong to caller', 'FORBIDDEN');
    }
    return c.json(await getPublisherStats(publisherId, timeframe));
  }

  const stats = await getAggregatedPublisherStats(
    publishers.map((p) => ({ id: p.id, displayName: p.displayName, domain: p.domain })),
    timeframe,
  );
  return c.json(stats);
});

publishersRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.domain) {
    throw new AppError(400, 'Domain is required', 'BAD_REQUEST');
  }

  // Check if publisher with this domain already exists
  const existing = await getPublisherByDomain(body.domain);
  if (existing) {
    throw new AppError(409, 'Publisher profile already exists for this domain', 'CONFLICT');
  }

  // Handle mapping from payoutDetails format to payoutMethod format
  let payoutMethod = body.payoutMethod;
  if (!payoutMethod && body.payoutDetails) {
    const { iban, kennitala, accountHolder } = body.payoutDetails;
    if (iban && kennitala && accountHolder) {
      payoutMethod = {
        type: 'bank',
        iban,
        kennitala,
        accountName: accountHolder,
      };
    }
  }

  // Ensure contentPolicy is defined
  const contentPolicy = body.contentPolicy || {
    blockedCategories: [],
    requireManualApproval: false,
  };

  const publisher = await createPublisher({
    ownerEmail: user.email,
    domain: body.domain,
    displayName: body.displayName,
    payoutMethod,
    contentPolicy,
    integrationPreference: body.integrationPreference,
    estimatedSlotsCount: body.estimatedSlotsCount,
    categories: body.categories,
  });

  // Automatically provision the default widget key
  await getOrCreateWidgetKey(user.email, 'publisher', publisher.id);

  return c.json(publisher, 201);
});

publishersRouter.post('/analyze-domain', async (c) => {
  const body = await c.req.json();
  const domain = body.domain;

  if (!domain) {
    throw new AppError(400, 'Domain is required', 'BAD_REQUEST');
  }

  const result = await scrapeAndClassifyDomain(domain);
  return c.json(result);
});

publishersRouter.get('/me', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  return c.json(publisher);
});

publishersRouter.patch('/me', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const body = await c.req.json();
  const updated = await updatePublisher(publisher.id, body);

  return c.json(updated);
});

publishersRouter.get('/me/stats', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const queryTimeframe = c.req.query('timeframe');
  const timeframe = queryTimeframe === '30' ? 30 : 7;

  const stats = await getPublisherStats(publisher.id, timeframe);
  return c.json(stats);
});

publishersRouter.get('/me/widget-key', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const keyRecord = await getOrCreateWidgetKey(user.email, 'publisher', publisher.id);
  return c.json({ key: keyRecord.key });
});

publishersRouter.post('/me/widget-key/rotate', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const existing = await getWidgetKeyByTargetId(publisher.id, 'publisher');
  if (existing) {
    await revokeWidgetKey(existing.id);
  }

  const newKey = await issueWidgetKey(user.email, 'publisher', publisher.id);
  return c.json({ key: newKey.key });
});

publishersRouter.get('/me/payouts', async (c) => {
  const user = c.get('user');
  const publisher = await getPublisherByOwnerEmail(user.email);

  if (!publisher) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const payouts = await listPublisherPayouts(publisher.id);
  return c.json(payouts);
});

// IMPORTANT-5 (adversarial review): the real unpaid basis, computed the same
// way generateMonthlyPayouts computes it — Earnings.tsx's "Beðið eftir
// útgreiðslu" figure used to be derived from a trailing-30-day spend stat
// instead, which contradicted this minimum-threshold copy for any publisher
// whose monthly earnings sit below MIN_PAYOUT_ISK. Sums across every
// publisher doc the caller owns (getPublishersByOwnerEmail, not the
// single-publisher getPublisherByOwnerEmail /me/* routes use), consistent
// with how Earnings already aggregates its other stats.
publishersRouter.get('/me/balance', async (c) => {
  const user = c.get('user');
  const publishers = await getPublishersByOwnerEmail(user.email);

  if (publishers.length === 0) {
    throw new AppError(404, 'Publisher profile not found', 'NOT_FOUND');
  }

  const unpaidBasisIsk = await getUnpaidBasisIsk(publishers.map((p) => p.id));
  return c.json({ unpaidBasisIsk, minPayoutIsk: MIN_PAYOUT_ISK });
});
