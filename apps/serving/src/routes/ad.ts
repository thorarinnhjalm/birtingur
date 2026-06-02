import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache';
import { selectCreative } from '../lib/select';
import {
  getOrCreateVisitorToken,
  setCookieHeader,
  getVisitorImpressionsToday,
} from '../lib/visitor';
import { logEvent } from '../lib/analytics';

export const adRoute = new Hono();

adRoute.get('/', async (c) => {
  const slotId = c.req.query('slot');
  const consentParam = c.req.query('consent') === 'full' ? 'full' : 'none';

  if (!slotId) {
    return c.json({ error: 'missing_slot' }, 400);
  }

  const slot = await getSlotCache(slotId);
  if (!slot) {
    return c.json({ empty: true });
  }

  const country = c.req.header('CF-IPCountry') ?? 'XX';
  const token = getOrCreateVisitorToken(c.req.header('Cookie'));
  const visitorImpressionsToday =
    consentParam === 'full' ? await getVisitorImpressionsToday(token) : {};

  const creative = selectCreative(slot, {
    country,
    consent: consentParam,
    visitorImpressionsToday,
  });

  if (!creative) {
    return c.json({ empty: true });
  }

  // Build impression pixel URL (points to relative /v1/impression route)
  const impressionPixel =
    `/v1/impression?c=${encodeURIComponent(creative.creativeId)}` +
    `&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}`;

  // Log impression event
  void logEvent({
    type: 'impression',
    slotId,
    publisherId: slot.publisherId,
    creativeId: creative.creativeId,
    campaignId: creative.campaignId,
    advertiserId: '', // populated in batch aggregation
    country,
    visitorToken: token,
    ts: Date.now(),
  });

  c.header('Set-Cookie', setCookieHeader(token));
  c.header('Cache-Control', 'private, no-store');
  
  return c.json({
    creativeId: creative.creativeId,
    imageUrl: creative.imageUrl,
    clickUrl: `/v1/click?c=${encodeURIComponent(creative.creativeId)}&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}`,
    width: creative.width,
    height: creative.height,
    impressionPixel,
    ttl: 30,
  });
});
