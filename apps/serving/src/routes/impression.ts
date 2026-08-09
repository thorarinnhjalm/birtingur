import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache.js';
import { recordVisitorImpression } from '../lib/visitor.js';
import { decrementBudget, logEvent, incrementPaceSpent } from '../lib/analytics.js';
import { verifySignature, claimSignatureOnce } from '../lib/crypto.js';
import { getClientIp } from '../lib/ip.js';
import { checkAndIncrementRateLimit } from '../lib/fraud.js';

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

// Below-the-fold / lazy-loaded slots can render minutes after the ad is served,
// so allow a window wider than the original 5 min but still bounded.
const IMPRESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1h

export const impressionRoute = new Hono();

impressionRoute.get('/', async (c) => {
  // Wrap the entire handler in try/catch: the pixel MUST always be returned,
  // even if Redis, Firestore, or any downstream service is temporarily down.
  // Without this, a Redis failure on claimSignatureOnce would crash the handler
  // and the browser would receive a 500 — losing the impression AND triggering
  // client-side error noise.
  try {
    const creativeId = c.req.query('c');
    const slotId = c.req.query('s');
    const token = c.req.query('t') ?? '';
    const typeParam = c.req.query('type');

    if (!creativeId || !slotId) {
      return pixelResponse();
    }

    const isFallback =
      creativeId === 'cre_fallback_transparent' ||
      creativeId === 'cre_fallback_birtingur' ||
      creativeId === 'cre_nocache' ||
      typeParam === 'pageview';

    // Signature is required for EVERY branch, pageviews included. `type` comes
    // from the query string, so before this check anyone who knew a slot id —
    // it sits in the publisher's page source — could append `&type=pageview`
    // and write unlimited traffic events for that slot, inflating the pageview
    // and fill-rate figures the publisher dashboard reports. Every pixel the
    // ad route hands out is signed (routes/ad.ts), so nothing legitimate loses
    // out.
    const tsStr = c.req.query('ts') ?? '0';
    const sig = c.req.query('sig') ?? '';
    const ts = parseInt(tsStr, 10);
    const age = Date.now() - ts;
    if (
      !verifySignature(creativeId, slotId, token, ts, sig) ||
      age < 0 ||
      age > IMPRESSION_MAX_AGE_MS
    ) {
      // Invalid or expired signature: ignore silently (still return the pixel).
      return pixelResponse();
    }

    if (isFallback) {
      // No write here anymore: slot_load (routes/ad.ts) now covers no-fill slot
      // loads server-side at serve time, so this pixel firing would double-count
      // the same slot load a second time. Keep the signature check and claim
      // below so old cached snippets still firing this legacy `type=pageview`
      // pixel are validated and rate-limited (the claim also still prevents the
      // signature from being replayed against the click branch, since fallback
      // click URLs share this signature — see SignatureKind in lib/crypto.ts).
      const fresh = await claimSignatureOnce(sig, IMPRESSION_MAX_AGE_MS / 1000, 'pv');
      if (!fresh) {
        return pixelResponse();
      }
    } else {
      const fresh = await claimSignatureOnce(sig, IMPRESSION_MAX_AGE_MS / 1000, 'imp');
      if (!fresh) {
        return pixelResponse();
      }

      const slot = await getSlotCache(slotId);
      const creative = slot?.activeCreatives.find((cc) => cc.creativeId === creativeId);

      if (slot && creative) {
        const ip = getClientIp({
          'x-real-ip': c.req.header('x-real-ip'),
          'x-forwarded-for': c.req.header('x-forwarded-for'),
        });
        const isAllowed = await checkAndIncrementRateLimit(creative.campaignId, ip, 'impression');

        if (isAllowed) {
          // Log the impression now — the pixel firing proves the ad was actually seen.
          // Own try/catch: a Redis pipeline failure here must not skip the budget
          // decrement/pacing/visitor-cap side effects below, which used to run
          // unconditionally when this was fire-and-forget.
          try {
            await logEvent({
              type: 'impression',
              slotId,
              publisherId: slot.publisherId,
              creativeId,
              campaignId: creative.campaignId,
              advertiserId: '', // populated in batch aggregation
              country: c.req.header('CF-IPCountry') ?? 'XX',
              visitorToken: token,
              ts: Date.now(),
            });
          } catch (err) {
            console.error('logEvent failed (impression):', err);
          }

          if (token) {
            void recordVisitorImpression(token, creativeId);
          }
          // CPM price models charge per 1000 impressions
          if (slot.pricing.mode === 'cpm') {
            const costIsk = Math.round((slot.pricing.cpmIsk ?? 0) / 1000);
            void decrementBudget(creative.campaignId, costIsk);
            void incrementPaceSpent(creative.campaignId, costIsk);
          }
        } else {
          console.warn(
            `Impression rate limit exceeded for campaign ${creative.campaignId} from IP ${ip}`,
          );
        }
      } else if (!slot || !creative) {
        // The slot cache expired between when the ad was served and when the impression
        // pixel fired. We can't attribute this impression to a specific campaign, so we
        // drop it rather than logging with an empty campaignId — logging with empty IDs
        // would inflate publisher stats without crediting any campaign, causing the two
        // dashboards to show different impression totals for the same events.
        console.warn(
          `Impression dropped for stale slot cache: slot=${slotId}, creative=${creativeId}, slotFound=${!!slot}`,
        );
      }
    }
  } catch (err) {
    // Never let an internal failure prevent the pixel from being returned.
    // A crashing impression handler is worse than a lost event — it causes client-side
    // errors and makes the ad slot look broken.
    console.error('Impression handler error (pixel still returned):', err);
  }

  return pixelResponse();
});
