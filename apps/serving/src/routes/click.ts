import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache.js';
import { logEvent } from '../lib/analytics.js';
import { verifySignature } from '../lib/crypto.js';

export const clickRoute = new Hono();

// A click can happen long after the ad was served (the ts is stamped at serve
// time, not click time) — a user may leave the page open and click hours later.
// Keep the window generous so legitimate late clicks are not dropped.
const CLICK_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

clickRoute.get('/', async (c) => {
  const creativeId = c.req.query('c');
  const slotId = c.req.query('s');
  const token = c.req.query('t') ?? '';
  const tsStr = c.req.query('ts') ?? '0';
  const sig = c.req.query('sig') ?? '';

  if (!creativeId || !slotId) {
    return c.text('Bad Request', 400);
  }

  // Validate signature to prevent click fraud
  const ts = parseInt(tsStr, 10);
  const isValid = verifySignature(creativeId, slotId, token, ts, sig);
  const age = Date.now() - ts;

  if (!isValid || age < 0 || age > CLICK_MAX_AGE_MS) {
    return c.text('Bad Request: Invalid or expired tracking token', 400);
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
