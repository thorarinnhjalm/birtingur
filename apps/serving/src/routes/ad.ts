import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache.js';
import { FLAT_CPM_ISK } from '@ada/shared';
import { selectCreative } from '../lib/select.js';
import { getVisitorRegions } from '../lib/geo.js';
import {
  getOrCreateVisitorToken,
  setCookieHeader,
  getVisitorImpressionsToday,
} from '../lib/visitor.js';
import { getRemainingBudgets, getPaceState } from '../lib/analytics.js';
import { createSignature } from '../lib/crypto.js';

export const adRoute = new Hono();

adRoute.get('/', async (c) => {
  const slotId = c.req.query('slot');
  const consentParam = c.req.query('consent') === 'full' ? 'full' : 'none';

  if (!slotId) {
    return c.json({ error: 'missing_slot' }, 400);
  }

  const country = c.req.header('CF-IPCountry') ?? 'XX';
  const token = getOrCreateVisitorToken(c.req.header('Cookie'), c.req.query('vid'));

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
          clickUrl: 'https://birtingur.app',
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
    // Even when the slot cache is empty (expired or never populated), return a tracking
    // pixel so we can record a pageview. Without this, uncached-slot visits are invisible
    // to stats — a silent black hole that makes it look like the publisher has zero traffic.
    return c.json({
      empty: true,
      impressionPixel: `/v1/impression?c=cre_nocache&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}&type=pageview`,
    });
  }

  const visitorImpressionsToday =
    consentParam === 'full' ? await getVisitorImpressionsToday(token) : {};

  const campaignIds = Array.from(new Set(slot.activeCreatives.map((ac) => ac.campaignId)));
  const budgets = await getRemainingBudgets(campaignIds);
  const pace = await getPaceState(campaignIds);
  const fundedSlot = {
    ...slot,
    activeCreatives: slot.activeCreatives.filter((ac) => {
      const funded = (budgets[ac.campaignId] ?? Number.POSITIVE_INFINITY) > 0;
      const p = pace[ac.campaignId];
      const underPace = !p || p.spent < p.limit; // fail-open if unset
      return funded && underPace;
    }),
  };

  const regions = getVisitorRegions({
    'x-vercel-ip-city': c.req.header('x-vercel-ip-city'),
  });

  const creative = selectCreative(fundedSlot, {
    country,
    consent: consentParam,
    visitorImpressionsToday,
    regions,
  });

  if (!creative) {
    const size = slot.sizes[0] || { width: 300, height: 250 };
    c.header('Set-Cookie', setCookieHeader(token));
    c.header('Cache-Control', 'private, no-store');
    return c.json({
      creativeId: 'cre_fallback_birtingur',
      imageUrl: generateHouseAdSvg(size.width, size.height),
      clickUrl: 'https://birtingur.app',
      width: size.width,
      height: size.height,
      impressionPixel: `/v1/impression?c=cre_fallback_birtingur&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}&type=pageview`,
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

  // Impression is counted when the pixel fires (impression.ts), not here.

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

function generateHouseAdSvg(width: number, height: number): string {
  const isHorizontal = width > height * 1.5;
  const isCompact = width < 200 || height < 80;

  let content = '';

  if (isCompact) {
    content = `
      <text x="50%" y="55%" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800">Birtingur.app</text>
    `;
  } else if (isHorizontal) {
    const fontSizeTitle = height >= 90 ? 18 : 13;
    const fontSizeSub = height >= 90 ? 11 : 9;
    const buttonW = height >= 90 ? 110 : 80;
    const buttonH = height >= 90 ? 30 : 20;
    const buttonX = width - buttonW - width * 0.05;
    const buttonY = (height - buttonH) / 2;
    const buttonTextY = height >= 90 ? 19 : 13;
    const buttonTextSize = height >= 90 ? 10 : 8;

    content = `
      <g transform="translate(${width * 0.05}, ${height * 0.5})">
        <text x="0" y="-2" fill="#ffffff" font-size="${fontSizeTitle}" font-weight="800">Birtingur.app</text>
        <text x="0" y="${height >= 90 ? 16 : 12}" fill="#e0f2fe" font-size="${fontSizeSub}" font-weight="500">Auglýstu hér á 550 kr. CPM</text>
      </g>
      <g transform="translate(${buttonX}, ${buttonY})">
        <rect width="${buttonW}" height="${buttonH}" rx="6" fill="#ffffff" filter="url(#shadow)"/>
        <text x="${buttonW / 2}" y="${buttonTextY}" text-anchor="middle" fill="#1e3a8a" font-size="${buttonTextSize}" font-weight="800">Auglýsa</text>
      </g>
    `;
  } else {
    // Vertical or square layout
    const titleY = height * 0.28;
    const descY1 = height * 0.46;
    const descY2 = height * 0.56;
    const buttonW = Math.min(width * 0.8, 140);
    const buttonH = 34;
    const buttonX = (width - buttonW) / 2;
    const buttonY = height * 0.7;
    const buttonTextY = 21;

    content = `
      <text x="50%" y="${titleY}" text-anchor="middle" fill="#ffffff" font-size="20" font-weight="900">Birtingur.app</text>
      <text x="50%" y="${descY1}" text-anchor="middle" fill="#e0f2fe" font-size="12" font-weight="700">Auglýstu hér</text>
      <text x="50%" y="${descY2}" text-anchor="middle" fill="#e0f2fe" font-size="10" font-weight="500">550 kr. CPM fastaverð</text>
      
      <g transform="translate(${buttonX}, ${buttonY})">
        <rect width="${buttonW}" height="${buttonH}" rx="8" fill="#ffffff" filter="url(#shadow)"/>
        <text x="${buttonW / 2}" y="${buttonTextY}" text-anchor="middle" fill="#1e3a8a" font-size="11" font-weight="800">Prófa núna</text>
      </g>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e3a8a" />
        <stop offset="100%" stop-color="#0ea5e9" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.15"/>
      </filter>
    </defs>
    <style>
      text { font-family: 'Inter', system-ui, sans-serif; }
    </style>
    <rect width="100%" height="100%" fill="url(#grad)"/>
    ${content}
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
