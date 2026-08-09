import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache.js';
import { logEvent, PAGEVIEW_CREATIVE_ID } from '../lib/analytics.js';
import { verifySignature, claimSignatureOnce } from '../lib/crypto.js';

// Transparent 1x1 GIF tracking pixel
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const pixelResponse = () =>
  new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store',
    },
  });

// Same window as the impression pixel: below-the-fold slots can render minutes
// after the page loaded, so the pixel fires later than ts.
const MAX_AGE = 60 * 60 * 1000; // 1h

export const pageviewRoute = new Hono();

pageviewRoute.get('/', async (c) => {
  // Wrap the entire handler in try/catch: the pixel MUST always be returned,
  // even if Redis or any downstream service is temporarily down. Without this,
  // a Redis failure would crash the handler and the browser would receive a
  // 500 — losing the pageview AND triggering client-side error noise.
  try {
    const slotId = c.req.query('s');
    const token = c.req.query('t') ?? '';

    if (!slotId) {
      return pixelResponse();
    }

    const tsStr = c.req.query('ts') ?? '0';
    const sig = c.req.query('sig') ?? '';
    const ts = parseInt(tsStr, 10);
    const age = Date.now() - ts;

    // Signature required, same as every other counted event: `type` used to come
    // from the query string and forging `&type=pageview` inflated publisher
    // traffic (see the 2026-08-05 audit). A page-level pixel signs with the
    // PAGEVIEW_CREATIVE_ID placeholder because no creative is involved.
    if (
      !verifySignature(PAGEVIEW_CREATIVE_ID, slotId, token, ts, sig) ||
      age < 0 ||
      age > MAX_AGE
    ) {
      return pixelResponse();
    }

    const fresh = await claimSignatureOnce(sig, MAX_AGE / 1000, 'pv');
    if (!fresh) return pixelResponse();

    const slot = await getSlotCache(slotId);
    if (slot?.publisherId) {
      await logEvent({
        type: 'pageview',
        slotId,
        publisherId: slot.publisherId,
        creativeId: PAGEVIEW_CREATIVE_ID,
        campaignId: '',
        advertiserId: '',
        country: c.req.header('CF-IPCountry') ?? 'XX',
        visitorToken: token,
        ts: Date.now(),
      });
    }
    // If the slot cache has expired, we don't know which publisher this pageview
    // belongs to. Logging with publisherId='' would write to a garbage Firestore
    // path (stats/publishers//YYYYMMDD) and accumulate junk data.
  } catch (err) {
    // Never let an internal failure prevent the pixel from being returned.
    console.error('Pageview handler error (pixel still returned):', err);
  }

  return pixelResponse();
});
