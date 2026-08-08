import { URL } from 'node:url';
import type { GeneratedCopyVariant } from '@ada/shared';
import { ssrfGuardedFetch, SsrfBlockedError } from './ssrf.js';

export { SsrfBlockedError };

/** What we manage to scrape from the advertiser's landing page. Every field is
 * best-effort — a landing page missing meta tags still gets a usable (if
 * generic) result via the rule-based fallbacks below. */
export interface SiteContext {
  url: string;
  title: string;
  description: string;
  siteName: string;
  ogImage?: string;
  logoCandidates: string[];
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Pure candidate extraction for the advertiser's logo (creative-logo-embed,
 * 2026-08-08 design) — no fetch, so it's directly unit-testable against an
 * HTML fixture. Priority order, highest-quality first:
 *  1. `<link rel="apple-touch-icon">` (largest declared `sizes` first) —
 *     these are near-always a clean square logo mark, not a favicon-sized
 *     glyph.
 *  2. The first `<img>` whose src/alt/class mentions "logo".
 *  3. `<link rel="icon">` (largest declared `sizes` first) — a last resort,
 *     since a bare favicon is often too small/generic to look good in a
 *     rendered banner.
 * `og:image` is deliberately NEVER a candidate here — it's typically a hero
 * photo, not a logo mark, and stays a separate field on SiteContext.
 * Candidates are resolved to absolute URLs against `baseUrl` and deduped;
 * an unparseable href is skipped rather than aborting extraction.
 */
export function extractLogoCandidates(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];
  const push = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const abs = new URL(decodeHtmlEntities(raw.trim()), baseUrl).toString();
      if (!candidates.includes(abs)) candidates.push(abs);
    } catch {
      /* unparseable href — skip */
    }
  };

  // 1. apple-touch-icon (largest `sizes` first when several are declared)
  const appleIcons = [
    ...html.matchAll(/<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]*>/gi),
  ]
    .map((m) => ({
      href: m[0].match(/href=["']([^"']+)["']/i)?.[1],
      size: parseInt(m[0].match(/sizes=["'](\d+)x/i)?.[1] ?? '0', 10),
    }))
    .sort((a, b) => b.size - a.size);
  for (const icon of appleIcons) push(icon.href);

  // 2. first <img> whose src/alt/class mentions "logo"
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    if (/(?:src|alt|class)=["'][^"']*logo[^"']*["']/i.test(tag)) {
      push(tag.match(/src=["']([^"']+)["']/i)?.[1]);
      break;
    }
  }

  // 3. <link rel="icon">, largest declared size first
  const icons = [...html.matchAll(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi)]
    .map((m) => ({
      href: m[0].match(/href=["']([^"']+)["']/i)?.[1],
      size: parseInt(m[0].match(/sizes=["'](\d+)x/i)?.[1] ?? '0', 10),
    }))
    .sort((a, b) => b.size - a.size);
  for (const icon of icons) push(icon.href);

  return candidates;
}

/**
 * Fetches and extracts `<title>`, meta description, og:image, og:site_name
 * and logo candidates from a landing page via plain regex (no cheerio/DOM
 * parser, per the plan — this is a small, bounded extraction and a full HTML
 * parser is unwarranted dependency weight for it). The fetch itself goes
 * through the SSRF guard.
 *
 * The extracted text is later interpolated into a Gemini prompt — treat it as
 * hostile: a malicious landing page could embed prompt-injection text in its
 * title/description. Callers must wrap it in delimiters and instruct the
 * model to treat it as data (see gemini.ts), never as instructions.
 */
export async function extractSiteContext(url: string): Promise<SiteContext> {
  const { body: html, finalUrl } = await ssrfGuardedFetch(url);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].trim()) : '';

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
  const description = descMatch?.[1] ? decodeHtmlEntities(descMatch[1].trim()) : '';

  const siteNameMatch =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:site_name["']/i);
  const siteName = siteNameMatch?.[1] ? decodeHtmlEntities(siteNameMatch[1].trim()) : '';

  const ogImageMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
  const ogImageRaw = ogImageMatch?.[1] ? decodeHtmlEntities(ogImageMatch[1].trim()) : undefined;
  let ogImage: string | undefined;
  if (ogImageRaw) {
    try {
      ogImage = new URL(ogImageRaw, finalUrl).toString();
    } catch {
      ogImage = undefined;
    }
  }

  return {
    url: finalUrl,
    title,
    description,
    siteName: siteName || new URL(finalUrl).hostname,
    ogImage,
    logoCandidates: extractLogoCandidates(html, finalUrl),
  };
}

/** Rule-based copy fallback — used whenever GEMINI_API_KEY is absent or the
 * Gemini call fails, exactly the graceful-degradation contract used by
 * ai-advisor.ts and the auto-scan stub. Deterministic and key-less so the
 * whole generation pipeline works in the emulator test suite. */
export function ruleBasedCopyVariants(ctx: SiteContext, n: number): GeneratedCopyVariant[] {
  const name = (ctx.siteName || ctx.title || 'Vefsíðan').slice(0, 30);
  const variants: GeneratedCopyVariant[] = [
    {
      headline: name.slice(0, 30),
      subline: (ctx.description || 'Kynntu þér vöruúrvalið á vefnum okkar.').slice(0, 60),
      cta: 'Sjá nánar',
    },
    {
      headline: 'Kíktu við hjá okkur'.slice(0, 30),
      subline: (ctx.description || name).slice(0, 60),
      cta: 'Skoða vefinn',
    },
    {
      headline: `Nýtt frá ${name}`.slice(0, 30),
      subline: (ctx.description || 'Frekari upplýsingar á vefsíðunni.').slice(0, 60),
      cta: 'Nánar hér',
    },
  ];
  return variants.slice(0, Math.max(1, Math.min(n, variants.length)));
}
