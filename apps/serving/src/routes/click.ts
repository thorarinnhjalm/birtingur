import { Hono } from 'hono';
import { URL } from 'url';
import { getSlotCache } from '../lib/cache.js';
import { logEvent } from '../lib/analytics.js';
import { verifySignature, claimSignatureOnce } from '../lib/crypto.js';
import { getClientIp } from '../lib/ip.js';
import { isClickDeduplicated, checkAndIncrementRateLimit } from '../lib/fraud.js';

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

  const fresh = await claimSignatureOnce(sig, CLICK_MAX_AGE_MS / 1000);
  if (!fresh) {
    return c.text('Already counted', 409);
  }

  const slot = await getSlotCache(slotId);

  const isFallback = creativeId.startsWith('cre_fallback_');

  if (isFallback) {
    const ip = getClientIp({
      'x-real-ip': c.req.header('x-real-ip'),
      'x-forwarded-for': c.req.header('x-forwarded-for'),
    });

    const isDuplicated = await isClickDeduplicated(creativeId, ip);
    if (!isDuplicated) {
      void logEvent({
        type: 'click',
        slotId,
        publisherId: slot?.publisherId ?? '',
        creativeId,
        campaignId: 'cmp_fallback',
        advertiserId: '',
        country: c.req.header('CF-IPCountry') ?? 'XX',
        visitorToken: token,
        ts: Date.now(),
      });
    } else {
      console.warn(
        `Click rate limited/deduplicated for fallback creative ${creativeId} from IP ${ip}`,
      );
    }

    const targetUrl = 'https://birtingur.app';
    return c.redirect(targetUrl, 302);
  }

  const creative = slot?.activeCreatives.find((cc) => cc.creativeId === creativeId);

  if (!slot || !creative) {
    return c.text('Not Found', 404);
  }

  const ip = getClientIp({
    'x-real-ip': c.req.header('x-real-ip'),
    'x-forwarded-for': c.req.header('x-forwarded-for'),
  });

  const isDuplicated = await isClickDeduplicated(creativeId, ip);
  let isAllowed = false;
  if (!isDuplicated) {
    isAllowed = await checkAndIncrementRateLimit(creative.campaignId, ip, 'click');
  }

  if (!isDuplicated && isAllowed) {
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
  } else {
    console.warn(
      `Click rate limited/deduplicated for creative ${creativeId} from IP ${ip} (isDuplicated=${isDuplicated}, isAllowed=${isAllowed})`,
    );
  }

  // Automatically append UTM parameters for Google Analytics/Plausible tracking
  let redirectUrl = creative.clickUrl;
  try {
    const urlObj = new URL(redirectUrl);
    if (!urlObj.searchParams.has('utm_source')) {
      urlObj.searchParams.set('utm_source', 'birtingur');
    }
    if (!urlObj.searchParams.has('utm_medium')) {
      urlObj.searchParams.set('utm_medium', 'display');
    }
    if (!urlObj.searchParams.has('utm_campaign')) {
      urlObj.searchParams.set('utm_campaign', creative.campaignId);
    }
    if (!urlObj.searchParams.has('utm_content')) {
      urlObj.searchParams.set('utm_content', slotId);
    }
    redirectUrl = urlObj.toString();
  } catch {
    // Fallback to original clickUrl if parsing fails
  }

  return c.redirect(redirectUrl, 302);
});
