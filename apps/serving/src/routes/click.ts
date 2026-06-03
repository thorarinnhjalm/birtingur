import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache';
import { logEvent } from '../lib/analytics';

export const clickRoute = new Hono();

clickRoute.get('/', async (c) => {
  const creativeId = c.req.query('c');
  const slotId = c.req.query('s');
  const token = c.req.query('t') ?? '';

  if (!creativeId || !slotId) {
    return c.text('Bad Request', 400);
  }

  const slot = await getSlotCache(slotId);
  const creative = slot?.activeCreatives.find((cc) => cc.creativeId === creativeId);

  if (!slot || !creative) {
    return c.text('Not Found', 404);
  }

  // Log click event (fire-and-forget best effort)
  void logEvent({
    type: 'click',
    slotId,
    publisherId: slot.publisherId,
    creativeId,
    campaignId: creative.campaignId,
    advertiserId: '', // populated in batch aggregation
    country: c.req.header('CF-IPCountry') ?? 'XX',
    visitorToken: token,
    ts: Date.now(),
  });

  return c.redirect(creative.clickUrl, 302);
});
