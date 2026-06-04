import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache.js';
import { FLAT_CPM_ISK } from '@ada/shared';
import { selectCreative } from '../lib/select.js';
import {
  getOrCreateVisitorToken,
  setCookieHeader,
  getVisitorImpressionsToday,
} from '../lib/visitor.js';
import { logEvent } from '../lib/analytics.js';
import { createSignature } from '../lib/crypto.js';

export const adRoute = new Hono();

adRoute.get('/', async (c) => {
  const slotId = c.req.query('slot');
  const consentParam = c.req.query('consent') === 'full' ? 'full' : 'none';

  if (!slotId) {
    return c.json({ error: 'missing_slot' }, 400);
  }

  let slot = await getSlotCache(slotId);
  if (!slot && (slotId === 'slot_demo_abc' || process.env.NODE_ENV === 'development')) {
    slot = {
      slotId: slotId,
      publisherId: 'pub_demo_123',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: FLAT_CPM_ISK },
      activeCreatives: [
        {
          creativeId: 'cre_demo_123',
          imageUrl:
            'https://lh3.googleusercontent.com/aida-public/AB6AXuAYtV8RJUi4lIJ473dz6RIg3rnxRRNprhM02JFfjvb9cDJO5GgdIlqo02s2V_UOnaQ1Ui24nQ4RqgPJpyYZslNfIOdRdwUXqJQUswqeKm6Vmdlkth8XJfRwCHtuoeZLxK_tcIT9e2TLu25yQkKJu8dyoTyWmkiW-S_I-ySk5dUvWJB-uajvoI1VjkKEHMEi05i7FJNFYo1732K_LKWaw-NTRk6dsCAZ4nMMSkZMoOuvg14yCh-Z5vgpziNtVXIYW0Vp49NfBSSQvWQ',
          clickUrl: 'https://birtingur.is',
          width: 300,
          height: 250,
          campaignId: 'cmp_demo_123',
          weight: 1,
          budgetExhausted: false,
          validFrom: Date.now() - 86400000,
          validTo: Date.now() + 86400000,
          frequencyCapPerDay: 5,
          priority: 'cpm',
        },
      ],
      blockedCategories: [],
      refreshedAt: Date.now(),
    };
  }

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
    c.header('Set-Cookie', setCookieHeader(token));
    c.header('Cache-Control', 'private, no-store');
    return c.json({
      creativeId: 'cre_fallback_transparent',
      imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      clickUrl: '#',
      width: 1,
      height: 1,
      impressionPixel: `/v1/impression?c=cre_fallback_transparent&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}&type=pageview`,
      ttl: 60,
    });
  }

  // Build impression pixel URL (points to relative /v1/impression route) with signature
  const ts = Date.now();
  const signature = createSignature(creative.creativeId, slotId, token, ts);
  const impressionPixel =
    `/v1/impression?c=${encodeURIComponent(creative.creativeId)}` +
    `&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}` +
    `&ts=${ts}&sig=${signature}`;

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
    clickUrl: `/v1/click?c=${encodeURIComponent(creative.creativeId)}&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}&ts=${ts}&sig=${signature}`,
    width: creative.width,
    height: creative.height,
    impressionPixel,
    ttl: 30,
  });
});
