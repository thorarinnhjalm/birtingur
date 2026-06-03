import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache';
import { recordVisitorImpression } from '../lib/visitor';
import { decrementBudget, logEvent } from '../lib/analytics';

// Transparent 1x1 GIF tracking pixel
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

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
