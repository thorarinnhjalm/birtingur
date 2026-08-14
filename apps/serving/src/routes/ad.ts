import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache.js';
import { FLAT_CPM_ISK } from '@ada/shared';
import { selectCreative } from '../lib/select.js';
import { getVisitorRegions } from '../lib/geo.js';
import { getVisitorToken, getVisitorImpressionsToday } from '../lib/visitor.js';
import {
  getRemainingBudgets,
  getPaceState,
  logEvent,
  PAGEVIEW_CREATIVE_ID,
} from '../lib/analytics.js';
import { createSignature } from '../lib/crypto.js';
import { classifyRequest } from '../lib/bot-class.js';

export const adRoute = new Hono();

adRoute.get('/', async (c) => {
  const slotId = c.req.query('slot');
  const consentParam = c.req.query('consent') === 'full' ? 'full' : 'none';
  const wParam = c.req.query('w');
  const hParam = c.req.query('h');
  const widthParam = wParam ? parseInt(wParam, 10) : undefined;
  const heightParam = hParam ? parseInt(hParam, 10) : undefined;

  if (!slotId) {
    return c.json({ error: 'missing_slot' }, 400);
  }

  const country = c.req.header('CF-IPCountry') ?? 'XX';
  const token = getVisitorToken(c.req.query('vid'));
  const botClass = classifyRequest({
    userAgent: c.req.header('user-agent'),
    acceptLanguage: c.req.header('accept-language'),
  });

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
    // pixel so we can record a slot load. Without this, uncached-slot visits are invisible
    // to stats — a silent black hole that makes it look like the publisher has zero traffic.
    // No slot load is logged here: without a cached slot we don't know the publisherId,
    // and logging with an empty one would write junk data (same guard as impression.ts's
    // stale-cache drop). The impressionPixel (tagged type=pageview so impression.ts treats
    // it as the pageview/slot-load branch) is still handed out — impression.ts does its own
    // cache lookup when the pixel fires later, so if the cache has repopulated by then the
    // slot load still gets counted even though it could not be logged here.
    //
    // Deliberately NO pageviewPixel on this response. Cache-miss responses return fastest
    // of all — no creative selection, no budget/pace lookups — so they systematically win
    // the snippet's one-shot "fire from whichever slot's response arrives first" race. A
    // slot we know nothing about would then burn the page's one true page view even when
    // other, cached slots on the same page could have attributed it correctly. Omitting the
    // pixel here lets a later, cached slot's response fire it instead (see IMPORTANT-2,
    // 2026-08-09 traffic-measurement-integrity fix wave).
    const ts = Date.now();
    const signature = createSignature('cre_nocache', slotId, token, ts);
    return c.json({
      empty: true,
      impressionPixel: `/v1/impression?c=cre_nocache&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}&type=pageview&ts=${ts}&sig=${signature}`,
    });
  }

  // No token means no consented identifier, so there is nothing to cap against.
  const visitorImpressionsToday =
    consentParam === 'full' && token ? await getVisitorImpressionsToday(token) : {};

  const campaignIds = Array.from(new Set(slot.activeCreatives.map((ac) => ac.campaignId)));
  const budgets = await getRemainingBudgets(campaignIds);
  const pace = await getPaceState(campaignIds);
  const fundedSlot = {
    ...slot,
    activeCreatives: slot.activeCreatives.filter((ac) => {
      const funded = (budgets[ac.campaignId] ?? Number.POSITIVE_INFINITY) > 0;
      const p = pace[ac.campaignId];
      const underPace = !p || p.spent < p.limit; // fail-open if unset
      const sizeMatch =
        (widthParam === undefined || ac.width === widthParam) &&
        (heightParam === undefined || ac.height === heightParam);
      return funded && underPace && sizeMatch;
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
    const size =
      widthParam && heightParam
        ? { width: widthParam, height: heightParam }
        : slot.sizes[0] || { width: 300, height: 250 };
    c.header('Cache-Control', 'private, no-store');

    const ts = Date.now();
    const fallbackCreativeId =
      (slot as any).fallbackType === 'transparent'
        ? 'cre_fallback_transparent'
        : 'cre_fallback_birtingur';

    // Slot is known (we have publisherId from the cache) even though no creative
    // filled it — that's exactly the fill-rate denominator this event exists for.
    // Logged with the ordinary wire type 'pageview' (see AdEvent.type in
    // lib/analytics.ts) carrying the real fallback creativeId — that creativeId,
    // not the wire type, is what marks this as a slot load rather than a true
    // page view. Awaited like the fill-path log below; never let a Redis outage
    // block serving.
    try {
      await logEvent({
        type: 'pageview',
        slotId,
        publisherId: slot.publisherId,
        creativeId: fallbackCreativeId,
        campaignId: 'cmp_fallback',
        advertiserId: '',
        country,
        visitorToken: token,
        ts,
        botClass,
      });
    } catch (err) {
      console.error('logEvent failed (ad, no-fill):', err);
    }

    const pvTs = Date.now();
    const pvSig = createSignature(PAGEVIEW_CREATIVE_ID, slotId, token, pvTs);
    const pageviewPixel =
      `/v1/pageview?s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}` +
      `&ts=${pvTs}&sig=${pvSig}`;

    if (fallbackCreativeId === 'cre_fallback_transparent') {
      const signature = createSignature('cre_fallback_transparent', slotId, token, ts);
      return c.json({
        creativeId: 'cre_fallback_transparent',
        imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        clickUrl: '',
        width: size.width,
        height: size.height,
        impressionPixel: `/v1/impression?c=cre_fallback_transparent&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}&type=pageview&ts=${ts}&sig=${signature}`,
        pageviewPixel,
        ttl: 60,
        showBacklink: false,
      });
    }

    const signature = createSignature('cre_fallback_birtingur', slotId, token, ts);
    const clickUrl =
      `/v1/click?c=cre_fallback_birtingur` +
      `&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}` +
      `&ts=${ts}&sig=${signature}`;

    return c.json({
      creativeId: 'cre_fallback_birtingur',
      imageUrl: generateHouseAdSvg(size.width, size.height),
      clickUrl,
      width: size.width,
      height: size.height,
      impressionPixel: `/v1/impression?c=cre_fallback_birtingur&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}&type=pageview&ts=${ts}&sig=${signature}`,
      pageviewPixel,
      ttl: 60,
      showBacklink: true,
    });
  }

  // Build impression pixel URL (points to relative /v1/impression route) with signature
  const ts = Date.now();
  const signature = createSignature(creative.creativeId, slotId, token, ts);
  const impressionPixel =
    `/v1/impression?c=${encodeURIComponent(creative.creativeId)}` +
    `&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}` +
    `&ts=${ts}&sig=${signature}`;

  // Log the slot load for successful ad serve — this is the per-request fill-rate
  // denominator, not a page view (a page with three slots would otherwise
  // report three "page views"). Wire type is the ordinary 'pageview' (see
  // AdEvent.type in lib/analytics.ts); creative.creativeId is what marks this
  // as a slot load, not the wire type. Awaited for durability. Never let a
  // Redis outage block serving the ad — catch and log.
  try {
    await logEvent({
      type: 'pageview',
      slotId,
      publisherId: slot.publisherId,
      creativeId: creative.creativeId,
      campaignId: creative.campaignId,
      advertiserId: '',
      country,
      visitorToken: token,
      ts,
      botClass,
    });
  } catch (err) {
    console.error('logEvent failed (ad):', err);
  }

  // Impression is counted when the pixel fires (impression.ts), not here.

  const pvTs = Date.now();
  const pvSig = createSignature(PAGEVIEW_CREATIVE_ID, slotId, token, pvTs);
  const pageviewPixel =
    `/v1/pageview?s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}` +
    `&ts=${pvTs}&sig=${pvSig}`;

  c.header('Cache-Control', 'private, no-store');

  return c.json({
    creativeId: creative.creativeId,
    imageUrl: creative.imageUrl,
    clickUrl: `/v1/click?c=${encodeURIComponent(creative.creativeId)}&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}&ts=${ts}&sig=${signature}`,
    width: creative.width,
    height: creative.height,
    impressionPixel,
    pageviewPixel,
    ttl: 30,
    showBacklink: true,
  });
});

/**
 * Subtle pulse on the house ad's call-to-action.
 *
 * This is the only creative surface on the platform where a CSS animation
 * actually reaches a viewer. Advertiser creatives are rasterized to PNG by
 * apps/api's render-variant.ts before upload, so animation in those SVG
 * templates is flattened away — measured, the PNG is byte-identical with and
 * without it. The house ad is handed out as a `data:image/svg+xml` URI and the
 * snippet renders it in an `<img>`, where CSS animations do run.
 *
 * Three constraints shape what is safe here:
 *
 *  - No `:hover`, no `cursor`. An SVG in an `<img>` receives no pointer events,
 *    so those rules would be decoration that never fires.
 *  - The pulse scales a WRAPPER group, never the group that positions the
 *    button. A CSS `transform` overrides the `transform` presentation
 *    attribute, so animating the positioned group directly would yank the
 *    button to the origin on the first frame.
 *  - prefers-reduced-motion switches it off. This loops forever on somebody
 *    else's blog on every unfilled impression; a viewer who has asked their
 *    system for less motion has to be able to get it.
 */
const HOUSE_AD_ANIMATION_CSS = `
  @keyframes ctaPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
  .cta-pulse {
    transform-box: fill-box;
    transform-origin: center;
    animation: ctaPulse 3.2s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .cta-pulse { animation: none; }
  }`
  // Collapsed before it goes on the wire. This SVG is percent-encoded into the
  // JSON body of every unfilled ad request, and encodeURIComponent turns each
  // space and newline into three characters — so indentation that costs 100
  // bytes in this file costs 300 on the hot path. Written readable above,
  // shipped tight. CSS is whitespace-insensitive here (no string literals), so
  // collapsing runs is safe.
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Crude advance-width estimate. No font metrics are available here (the SVG is
 * handed to the browser as a data URI and never measured server-side), so this
 * is a per-character approximation calibrated for Inter-like system fonts.
 */
function estimateTextWidth(text: string, fontSize: number, weight: number): number {
  return text.length * fontSize * (weight >= 700 ? 0.58 : 0.5);
}

/**
 * Longest line from `candidates` that fits `available`, or '' if none do.
 *
 * Fitting is judged against 92% of the space so the estimate above has room to
 * be wrong. Reported from production 2026-08-14: the subtitle was chosen by
 * HEIGHT (`height >= 80` picked the longest line) while the constraint that
 * binds is WIDTH, so the 320x100 IAB mobile banner — tall enough to qualify,
 * half as wide as it needed to be — rendered ~324px of text into ~160px of
 * space and ran the tail under the button and off the canvas. On someone
 * else's site, as the platform's own advertisement.
 */
function pickFittingText(
  candidates: string[],
  fontSize: number,
  weight: number,
  available: number,
): string {
  const budget = available * 0.92;
  for (const candidate of candidates) {
    if (estimateTextWidth(candidate, fontSize, weight) <= budget) return candidate;
  }
  return '';
}

function generateHouseAdSvg(width: number, height: number): string {
  const isHorizontal = width > height * 1.5;
  const isCompact = width < 200 || height < 80;

  // Premium Logo SVG definition
  const logoGroup = `
    <g class="logo-mark">
      <!-- Stem -->
      <rect x="20" y="14" width="12" height="72" rx="3" fill="url(#spine-grad)" />
      <!-- Top fold -->
      <path d="M 32 14 L 62 14 L 50 28 L 32 28 Z" fill="url(#top-fold-grad)" />
      <!-- Top loop -->
      <path d="M 62 14 L 78 30 L 62 46 L 46 30 Z" fill="url(#top-loop-grad)" filter="url(#logo-shadow)" />
      <!-- Mid fold -->
      <path d="M 32 46 L 62 46 L 50 60 L 32 60 Z" fill="url(#mid-fold-grad)" filter="url(#logo-shadow)" />
      <!-- Bottom loop -->
      <path d="M 62 46 L 82 66 L 62 86 L 42 66 Z" fill="url(#bottom-loop-grad)" filter="url(#logo-shadow-deep)" />
      <!-- Bottom fold -->
      <path d="M 32 72 L 62 86 L 32 86 Z" fill="url(#bottom-fold-grad)" />
    </g>
  `;

  let content: string;
  // The compact layout (e.g. 120x60) has no call-to-action button, so there is
  // nothing to pulse and the animation CSS is omitted from it entirely rather
  // than shipped unused.
  let hasCta = false;

  if (isCompact) {
    // Mini layout (e.g. 120x60)
    const logoSize = Math.min(width * 0.25, height * 0.5, 24);
    const logoScale = logoSize / 100;
    const logoX = width * 0.1;
    const logoY = (height - logoSize) / 2;
    const textX = logoX + logoSize + 6;
    const fontSize = Math.max(9, Math.min(width * 0.08, 12));

    content = `
      <g transform="translate(${logoX}, ${logoY}) scale(${logoScale})">
        ${logoGroup}
      </g>
      <text x="${textX}" y="${height / 2 + fontSize * 0.35}" fill="#ffffff" font-size="${fontSize}" font-weight="800">Birtingur</text>
    `;
  } else if (isHorizontal) {
    // Horizontal banner layout (e.g. 728x90, 468x60)
    const logoSize = Math.min(height * 0.65, 52);
    const logoScale = logoSize / 100;
    const logoX = width * 0.03;
    const logoY = (height - logoSize) / 2;

    const textX = logoX + logoSize + 14;
    const titleSize = Math.max(12, Math.min(height * 0.26, 20));
    const subSize = Math.max(9, Math.min(height * 0.16, 12));

    const titleY = height * 0.42;
    const subY = height * 0.72;

    const buttonW = Math.max(75, Math.min(width * 0.22, 140));
    const buttonH = Math.max(22, Math.min(height * 0.44, 34));
    const buttonX = width - buttonW - width * 0.03;
    const buttonY = (height - buttonH) / 2;
    const buttonTextSize = Math.max(8, Math.min(buttonH * 0.36, 11));
    const buttonTextY = buttonH / 2 + buttonTextSize * 0.35;

    // Chosen by the width actually left between the logo and the button, not
    // by height. See pickFittingText.
    const pitchText = pickFittingText(
      [
        'Sjálfvirkur auglýsingamarkaður • 550 kr. CPM fastaverð',
        'Auglýstu á 550 kr. CPM • Birtingur.app',
        '550 kr. CPM fastaverð',
        '550 kr. CPM',
      ],
      subSize,
      500,
      buttonX - textX - 8,
    );

    const buttonText = buttonW > 100 ? 'Stofna herferð' : 'Auglýsa';

    hasCta = true;
    content = `
      <g transform="translate(${logoX}, ${logoY}) scale(${logoScale})">
        ${logoGroup}
      </g>
      <text x="${textX}" y="${titleY}" fill="#ffffff" font-size="${titleSize}" font-weight="900" letter-spacing="-0.02em">Birtingur</text>
      <text x="${textX}" y="${subY}" fill="#e0f2fe" font-size="${subSize}" font-weight="500">${pitchText}</text>
      
      <g class="cta-pulse">
        <g transform="translate(${buttonX}, ${buttonY})">
          <rect width="${buttonW}" height="${buttonH}" rx="${buttonH * 0.2}" fill="#ffffff" filter="url(#shadow)"/>
          <text x="${buttonW / 2}" y="${buttonTextY}" text-anchor="middle" fill="#1d4ed8" font-size="${buttonTextSize}" font-weight="800">${buttonText}</text>
        </g>
      </g>
    `;
  } else {
    // Vertical or square layout (e.g. 300x250, 300x600, 160x600)
    const logoSize = Math.min(width * 0.32, height * 0.22, 72);
    const logoScale = logoSize / 100;
    const logoX = (width - logoSize) / 2;
    const logoY = height * 0.12;

    const titleSize = Math.max(14, Math.min(width * 0.08, 22));
    const titleY = logoY + logoSize + titleSize + 8;

    const sub1Size = Math.max(10, Math.min(width * 0.048, 13));
    const sub1Y = titleY + sub1Size + 12;

    const sub2Size = Math.max(8, Math.min(width * 0.04, 11));
    const sub2Y = sub1Y + sub2Size + 10;

    const buttonW = Math.min(width * 0.75, 150);
    const buttonH = 34;
    const buttonX = (width - buttonW) / 2;
    const buttonY = Math.max(sub2Y + 24, height * 0.74);
    const buttonTextY = buttonH / 2 + 4;

    // Centred text, so the budget is the full canvas minus a margin on both
    // sides. Same reasoning as the horizontal branch: the old width thresholds
    // were hardcoded and ignored the font size the layout had just computed.
    const centredBudget = width - width * 0.12;
    const pitchText1 = pickFittingText(
      ['Sjálfvirkur auglýsingamarkaður', 'Auglýstu á netinu', 'Auglýstu hér'],
      sub1Size,
      700,
      centredBudget,
    );
    const pitchText2 = pickFittingText(
      ['Fastaverð: 550 kr. CPM • Engin lágmörk', '550 kr. CPM fastaverð', '550 kr. CPM'],
      sub2Size,
      500,
      centredBudget,
    );

    hasCta = true;
    content = `
      <g transform="translate(${logoX}, ${logoY}) scale(${logoScale})">
        ${logoGroup}
      </g>
      <text x="50%" y="${titleY}" text-anchor="middle" fill="#ffffff" font-size="${titleSize}" font-weight="900" letter-spacing="-0.02em">Birtingur</text>
      <text x="50%" y="${sub1Y}" text-anchor="middle" fill="#e0f2fe" font-size="${sub1Size}" font-weight="700">${pitchText1}</text>
      <text x="50%" y="${sub2Y}" text-anchor="middle" fill="#bae6fd" font-size="${sub2Size}" font-weight="500">${pitchText2}</text>
      
      <g class="cta-pulse">
        <g transform="translate(${buttonX}, ${buttonY})">
          <rect width="${buttonW}" height="${buttonH}" rx="8" fill="#ffffff" filter="url(#shadow)"/>
          <text x="${buttonW / 2}" y="${buttonTextY}" text-anchor="middle" fill="#1d4ed8" font-size="11" font-weight="800">Stofna herferð</text>
        </g>
      </g>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <!-- Background linear gradient -->
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#030712" />
        <stop offset="40%" stop-color="#0b1530" />
        <stop offset="100%" stop-color="#1d4ed8" />
      </linearGradient>

      <!-- Radial background glow -->
      <radialGradient id="glow" cx="10%" cy="10%" r="70%">
        <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0" />
      </radialGradient>

      <!-- Button shadow -->
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.18"/>
      </filter>

      <!-- Logo Gradients & Shadows -->
      <linearGradient id="spine-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1e3a8a" />
        <stop offset="100%" stop-color="#1e40af" />
      </linearGradient>
      <linearGradient id="top-fold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#0284c7" />
      </linearGradient>
      <linearGradient id="top-loop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6" />
        <stop offset="100%" stop-color="#1d4ed8" />
      </linearGradient>
      <linearGradient id="mid-fold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#06b6d4" />
        <stop offset="100%" stop-color="#0f766e" />
      </linearGradient>
      <linearGradient id="bottom-loop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#14b8a6" />
        <stop offset="100%" stop-color="#1d4ed8" />
      </linearGradient>
      <linearGradient id="bottom-fold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#2563eb" />
        <stop offset="100%" stop-color="#1e3a8a" />
      </linearGradient>
      <filter id="logo-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="-0.5" dy="1.5" stdDeviation="1.5" flood-color="#0f172a" flood-opacity="0.25"/>
      </filter>
      <filter id="logo-shadow-deep" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="-1" dy="2.5" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.35"/>
      </filter>
    </defs>
    <style>
      text { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }${hasCta ? HOUSE_AD_ANIMATION_CSS : ''}
    </style>
    <rect width="100%" height="100%" fill="url(#grad)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    ${content}
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
