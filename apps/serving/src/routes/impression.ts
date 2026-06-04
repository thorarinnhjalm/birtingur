import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache.js';
import { recordVisitorImpression } from '../lib/visitor.js';
import { decrementBudget, logEvent } from '../lib/analytics.js';
import { verifySignature } from '../lib/crypto.js';

// Transparent 1x1 GIF tracking pixel
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Below-the-fold / lazy-loaded slots can render minutes after the ad is served,
// so allow a window wider than the original 5 min but still bounded.
const IMPRESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1h

export const impressionRoute = new Hono();

impressionRoute.get('/', async (c) => {
  const creativeId = c.req.query('c');
  const slotId = c.req.query('s');
  const token = c.req.query('t') ?? '';
  const typeParam = c.req.query('type');

  if (!creativeId || !slotId) {
    return new Response(PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store',
      },
    });
  }

  const isFallback = creativeId === 'cre_fallback_transparent' || typeParam === 'pageview';

  if (isFallback) {
    const slot = await getSlotCache(slotId);
    if (slot) {
      void logEvent({
        type: 'pageview',
        slotId,
        publisherId: slot.publisherId,
        creativeId: 'cre_fallback_transparent',
        campaignId: 'cmp_fallback_transparent',
        advertiserId: '',
        country: c.req.header('CF-IPCountry') ?? 'XX',
        visitorToken: token,
        ts: Date.now(),
      });
    }
  } else {
    // Validate signature to prevent impression fraud
    const tsStr = c.req.query('ts') ?? '0';
    const sig = c.req.query('sig') ?? '';
    const ts = parseInt(tsStr, 10);
    const isValid = verifySignature(creativeId, slotId, token, ts, sig);
    const age = Date.now() - ts;

    if (!isValid || age < 0 || age > IMPRESSION_MAX_AGE_MS) {
      // Invalid signature or expired signature: ignore silently (still return pixel)
      return new Response(PIXEL, {
        status: 200,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store',
        },
      });
    }

    const slot = await getSlotCache(slotId);
    const creative = slot?.activeCreatives.find((cc) => cc.creativeId === creativeId);

    if (slot && creative) {
      if (token) {
        void recordVisitorImpression(token, creativeId);
      }
      // CPM price models charge per 1000 impressions
      if (slot.pricing.mode === 'cpm') {
        const costIsk = Math.round((slot.pricing.cpmIsk ?? 0) / 1000);
        void decrementBudget(creative.campaignId, costIsk);
      }
    }
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store',
    },
  });
});
