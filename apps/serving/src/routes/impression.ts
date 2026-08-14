import { Hono } from 'hono';
import { FLAT_CPM_ISK } from '@ada/shared';
import { getSlotCache } from '../lib/cache.js';
import { recordVisitorImpression } from '../lib/visitor.js';
import { decrementBudget, logEvent, incrementPaceSpent } from '../lib/analytics.js';
import { verifySignature, claimSignatureOnce } from '../lib/crypto.js';
import { getClientIp } from '../lib/ip.js';
import { checkAndIncrementRateLimit } from '../lib/fraud.js';
import { classifyRequest } from '../lib/bot-class.js';

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
    const botClass = classifyRequest({
      userAgent: c.req.header('user-agent'),
      acceptLanguage: c.req.header('accept-language'),
    });

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
      // Split by creativeId, because the two fallback cases differ in whether
      // ad.ts already recorded the slot load at serve time:
      //   - cre_fallback_transparent / cre_fallback_birtingur: the slot WAS
      //     known when the ad was served, so ad.ts's `!creative` branch already
      //     logged it. Writing again here would double-count it — no write for
      //     these.
      //   - cre_nocache: ad.ts's `!slot` branch served this because the cache
      //     was a miss, so it could NOT log a slot load (no publisherId to
      //     attribute it to). This pixel fires seconds later, after the cache
      //     has often repopulated, so it's the only remaining chance to record
      //     that slot load — do the lookup again here and log it if the
      //     publisher is now known.
      // Either way, keep the signature check and claim below so old cached
      // snippets still firing this legacy `type=pageview` pixel are validated
      // and rate-limited (the claim also still prevents the signature from
      // being replayed against the click branch, since fallback click URLs
      // share this signature — see SignatureKind in lib/crypto.ts).
      const fresh = await claimSignatureOnce(sig, IMPRESSION_MAX_AGE_MS / 1000, 'pv');
      if (!fresh) {
        return pixelResponse();
      }

      if (creativeId === 'cre_nocache') {
        try {
          const slot = await getSlotCache(slotId);
          if (slot?.publisherId) {
            // Wire type is the ordinary 'pageview' (see AdEvent.type in
            // lib/analytics.ts) — creativeId: 'cre_nocache' is what marks this
            // as a slot load, not the wire type.
            await logEvent({
              type: 'pageview',
              slotId,
              publisherId: slot.publisherId,
              creativeId: 'cre_nocache',
              campaignId: 'cmp_fallback',
              advertiserId: '',
              country: c.req.header('CF-IPCountry') ?? 'XX',
              visitorToken: token,
              ts: Date.now(),
              botClass,
            });
          }
          // If the cache is still cold, we still don't know the publisher —
          // drop it, same as everywhere else in this file.
        } catch (err) {
          console.error('logEvent failed (impression, cache-miss recovery):', err);
        }
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
              botClass,
            });
          } catch (err) {
            console.error('logEvent failed (impression):', err);
          }

          if (token) {
            // Counted per CAMPAIGN, matching what selectCreative caps against —
            // a campaign's variants share one frequency budget.
            void recordVisitorImpression(token, creative.campaignId);
          }
          // Every impression charges the platform's flat CPM, regardless of
          // what pricing the slot doc carries. Two reasons this is
          // unconditional rather than gated on `pricing.mode === 'cpm'`:
          //
          // 1. The accrual cron already charges FLAT_CPM_ISK per impression
          //    for every slot (services/accrual.ts). A slot whose stored
          //    pricing said `slot` therefore still cost the campaign money,
          //    but skipped this real-time decrement entirely — so it served
          //    past its budget until the 15-minute cron caught up. That is
          //    the one place in serving that could overspend.
          // 2. Reading `slot.pricing.cpmIsk` let a legacy slot with some
          //    other cached CPM disagree with what accrual actually books.
          const costIsk = Math.round(FLAT_CPM_ISK / 1000);
          void decrementBudget(creative.campaignId, costIsk);
          void incrementPaceSpent(creative.campaignId, costIsk);
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
