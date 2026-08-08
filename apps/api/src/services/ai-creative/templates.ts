import type { GeneratedCopyVariant } from '@ada/shared';

export type TemplateId = 'bold' | 'light';

export interface RenderBannerInput {
  width: number;
  height: number;
  copy: GeneratedCopyVariant;
  templateId: TemplateId;
  /**
   * Generated background for the 'bold' template (v1.5). Accepts either the
   * raw PNG Buffer OR an already-base64-encoded string (Fix 2, perf):
   * `generateCreativePreviews` calls Gemini once per variant and reuses the
   * SAME buffer across all `IAB_STANDARD_SIZES` renders — encoding that
   * buffer to base64 is nontrivial work (megabytes of data URI text) that
   * would otherwise redo per size for no reason, so the caller encodes it
   * ONCE and passes the resulting string here. A raw Buffer is still
   * accepted (and encoded internally) for direct callers/tests that don't
   * care about the per-size cost.
   */
  backgroundPng?: Buffer | string | null;
  /** Advertiser logo (creative-logo-embed, 2026-08-08 design), same
   * Buffer-or-base64 contract as `backgroundPng`. Absent/null = no logo,
   * render exactly as before this feature. */
  logoPng?: Buffer | string | null;
  /** Data-URI mime for `logoPng`. Defaults to `'image/png'`. */
  logoMime?: 'image/png' | 'image/jpeg';
}

/**
 * Two hand-designed Nordic-editorial banner templates (flat color blocks,
 * Inter, no stock imagery per v1's design summary):
 *  - 'bold': navy block, white text, gold CTA pill. Optional generated
 *    background image (v1.5) composites underneath a near-black scrim —
 *    the scrim is dark enough that white text stays WCAG AA-readable
 *    (>=4.5:1) even in the worst case of a pure-white generated image; see
 *    the contrast assertion in templates.test.ts for the actual computation.
 *  - 'light': off-white card, navy text, navy CTA pill. Deliberately kept
 *    flat-color only — layering a photo behind dark text without inverting
 *    the whole color scheme would need a second, differently-tuned scrim,
 *    so backgrounds are v1.5's incremental step only for 'bold'.
 * `variantIndex` (passed by the caller into copy/background generation, not
 * here) is what actually rotates advertisers between the two — this module
 * just renders whichever templateId it's given.
 */

const PALETTE = {
  bold: { bg: '#10265c', text: '#ffffff', sub: '#c7d2fe', ctaBg: '#f5b942', ctaText: '#1e293b' },
  light: { bg: '#f7f5f0', text: '#10265c', sub: '#475569', ctaBg: '#10265c', ctaText: '#ffffff' },
} as const;

/** Scrim color/opacity for background-image compositing on the 'bold'
 * template. See templates.test.ts for the WCAG contrast proof: a pure-white
 * worst-case background still yields >=4.5:1 contrast for white text. */
const SCRIM_COLOR = '#020617';
const SCRIM_OPACITY = 0.62;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Greedy word-wrap into at most `maxLines` lines of ~`maxChars` characters.
 * Words longer than `maxChars` (or a single-word input) are NOT split —
 * callers that need a hard width guarantee must additionally check the
 * rendered width of the result and fall back to `ellipsize`.
 *
 * Bug fix (visual QA, compact-tier 320x100 dangling-fragment finding): once
 * `maxLines - 1` complete lines have been placed, this used to just stop —
 * a `break` right after starting the final line discarded every word after
 * it, so a max-length headline could come out as a truncated fragment like
 * "Þórðargleði í" with no ellipsis marker at all. Now every remaining word
 * is folded onto the last allowed line instead of being dropped, even if
 * that makes the line run over `maxChars` — the caller's width estimate
 * then correctly sees that oversized last line as NOT fitting, so
 * `fitHeadlineBlock` keeps searching smaller font sizes and, only as a true
 * last resort, falls through to `ellipsize` (which always appends "…").
 * This guarantees `wrapText` never silently drops text — it either returns
 * the full text wrapped, or the caller detects the overflow and ellipsizes. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current && lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/** Hard character-budget truncation with an ellipsis, used as the last
 * resort when no font size in a tier's range makes text fit its box —
 * unlike `wrapText`, this ignores word boundaries so a single absurdly
 * long token can never overflow its box. */
function ellipsize(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return '…';
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// Text width estimate constants (calibrated for Inter): weight-800 (headline)
// glyphs run wider per character than weight-400 (subline) at the same size.
const HEADLINE_WIDTH_FACTOR = 0.52;
const SUBLINE_WIDTH_FACTOR = 0.5;
const HEADLINE_LINE_MULT = 1.12;
const SUBLINE_LINE_MULT = 1.3;
// Fraction of font-size above/below the baseline used to approximate a
// text block's visual bounding box from its baseline position. Sums to 1.0.
const TEXT_ASCENT = 0.78;
const TEXT_DESCENT = 0.22;

// Minimum gap enforced between any two element boxes (invariant #3).
const MIN_GAP = 8;

function textWidthEstimate(text: string, fontSize: number, weight: 400 | 800): number {
  return text.length * fontSize * (weight === 800 ? HEADLINE_WIDTH_FACTOR : SUBLINE_WIDTH_FACTOR);
}

function textBlockHeight(fontSize: number, lines: number, lineMult: number): number {
  const n = Math.max(1, lines);
  return fontSize * (TEXT_ASCENT + TEXT_DESCENT) + (n - 1) * fontSize * lineMult;
}

/** CTA pill width estimate — shared by geometry and SVG emission so the two
 * can never drift apart (fix requirement #4). */
function ctaPillWidth(text: string, fontSize: number): number {
  return Math.round(text.length * fontSize * 0.62 + fontSize * 2.2);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BannerTier = 'strip' | 'compact' | 'stacked';

export interface BannerFontSizes {
  headline: number;
  subline: number;
  cta: number;
}

export interface BannerLayoutResult {
  tier: BannerTier;
  width: number;
  height: number;
  padX: number;
  padY: number;
  boxes: Record<'headline' | 'subline' | 'cta', Box | null>;
  fontSizes: BannerFontSizes;
  /** Final (possibly shrunk/wrapped/ellipsized) text actually drawn. */
  headlineLines: string[];
  sublineLines: string[];
  ctaText: string;
}

/** Picks a tier from geometry (not a hardcoded size list) so future IAB
 * sizes fall into a sane bucket automatically:
 *  - `strip`: very short & wide rows (728x90, 980x120) — single line, no subline.
 *  - `compact`: short but not wide enough to be a strip (320x100) — a
 *    headline band stacked over a bottom-right CTA band, no subline.
 *  - `stacked`: everything else (300x250, 300x600) — headline, subline, CTA
 *    stacked vertically with room to breathe.
 */
function tierFor(width: number, height: number): BannerTier {
  if (height <= 120 && width / height >= 4) return 'strip';
  if (height <= 160) return 'compact';
  return 'stacked';
}

/**
 * Fits a headline into `maxLines` lines within `maxWidth` x `maxHeight`,
 * trying font sizes from `capSize` down to `floorSize` (largest first) and,
 * for each size, line counts from `maxLines` down to 1 (fewest wraps first).
 * The first (size, lineCount) combination whose wrapped text's estimated
 * box fits both dimensions wins. If nothing in range fits, falls back to
 * `floorSize` on a single ellipsized line — which by construction always
 * fits `maxWidth` (the ellipsis truncation is sized to the budget) though a
 * caller-side defensive clamp still guards against an unreasonably small
 * `maxHeight`.
 */
function fitHeadlineBlock(
  text: string,
  capSize: number,
  floorSize: number,
  maxLines: number,
  maxWidth: number,
  maxHeight: number,
): { lines: string[]; fontSize: number; width: number; height: number } {
  for (let fontSize = capSize; fontSize >= floorSize; fontSize--) {
    for (let lines = maxLines; lines >= 1; lines--) {
      const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * HEADLINE_WIDTH_FACTOR)));
      const wrapped = wrapText(text, maxChars, lines);
      const blockH = textBlockHeight(fontSize, wrapped.length, HEADLINE_LINE_MULT);
      const blockW = Math.max(...wrapped.map((l) => textWidthEstimate(l, fontSize, 800)));
      if (blockH <= maxHeight && blockW <= maxWidth) {
        return { lines: wrapped, fontSize, width: blockW, height: blockH };
      }
    }
  }
  // Nothing fit anywhere in the size/line-count range — hard-truncate at the
  // floor size so the result is guaranteed to respect maxWidth.
  const maxChars = Math.max(1, Math.floor(maxWidth / (floorSize * HEADLINE_WIDTH_FACTOR)));
  const truncated = ellipsize(text, maxChars);
  return {
    lines: [truncated],
    fontSize: floorSize,
    width: textWidthEstimate(truncated, floorSize, 800),
    height: textBlockHeight(floorSize, 1, HEADLINE_LINE_MULT),
  };
}

/** Drops subline lines (2 -> 1) trying to fit `maxHeight`, and — mirroring
 * `fitHeadlineBlock`'s last-resort fallback (Fix 5, adversarial review) —
 * ellipsizes a single line rather than vanishing entirely when even a
 * single line overflows `maxWidth` at both line counts tried above (e.g. a
 * long unbroken token `wrapText` can't break across lines). The subline
 * still disappears (`lines: []`) only when `maxHeight` itself can't fit even
 * one line's height — there is genuinely no room to draw anything then, and
 * that case is unchanged from before this fix. */
function fitSublineBlock(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxHeight: number,
): { lines: string[]; width: number; height: number } {
  if (maxHeight <= 0) return { lines: [], width: 0, height: 0 };
  for (let lines = 2; lines >= 1; lines--) {
    const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * SUBLINE_WIDTH_FACTOR)));
    const wrapped = wrapText(text, maxChars, lines);
    const blockH = textBlockHeight(fontSize, wrapped.length, SUBLINE_LINE_MULT);
    const blockW = Math.max(...wrapped.map((l) => textWidthEstimate(l, fontSize, 400)));
    if (blockH <= maxHeight && blockW <= maxWidth) {
      return { lines: wrapped, width: blockW, height: blockH };
    }
  }
  const oneLineHeight = textBlockHeight(fontSize, 1, SUBLINE_LINE_MULT);
  if (oneLineHeight > maxHeight) return { lines: [], width: 0, height: 0 };
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * SUBLINE_WIDTH_FACTOR)));
  const truncated = ellipsize(text, maxChars);
  return {
    lines: [truncated],
    width: textWidthEstimate(truncated, fontSize, 400),
    height: oneLineHeight,
  };
}

/**
 * Pure geometry computation, consumed by `renderBannerSvg`. Every element
 * (headline, subline, CTA) gets a bounding box computed BEFORE any SVG is
 * emitted, and the CTA — which never shrinks or wraps — is always laid out
 * first so the headline/subline fitting functions can budget the space
 * that's left, rather than the two being computed independently and
 * potentially overlapping (the root cause of the 320x100 bug).
 */
export function computeBannerLayout(input: {
  width: number;
  height: number;
  copy: GeneratedCopyVariant;
  /** Whether a logo chip will be composited onto this banner (creative-logo-
   * embed, 2026-08-08). Only consulted on the `strip` tier — see the
   * CRITICAL-3 fix comment on `headlineStartX` below. Defaults to false, so
   * every existing caller that doesn't pass it gets byte-identical geometry
   * to before this fix. */
  hasLogo?: boolean;
}): BannerLayoutResult {
  const { width, height, copy } = input;
  const tier = tierFor(width, height);
  const padX = Math.max(14, Math.round(width * 0.06));

  if (tier === 'strip') {
    const padY = Math.max(10, Math.round(height * 0.1));
    const ctaSize = Math.round(clamp(height * 0.15, 11, 15));
    const ctaPillH = Math.max(22, Math.round(height * 0.34));
    let ctaW = ctaPillWidth(copy.cta, ctaSize);
    // Defensive: never let the CTA claim more than ~62% of the inner width,
    // so a schema-max (15-char) CTA can't starve the headline of all room.
    const innerW = width - 2 * padX;
    ctaW = Math.min(ctaW, Math.round(innerW * 0.62));
    const ctaX = Math.max(padX, width - padX - ctaW);
    const ctaY = (height - ctaPillH) / 2;
    const ctaBox: Box = { x: ctaX, y: ctaY, w: ctaW, h: ctaPillH };

    const gap = 12;
    // CRITICAL-3 (adversarial review): on the strip tier the CTA is always
    // right-anchored, so `logoChipLayer`'s default bottom-right logo chip
    // always collides with it and flips to bottom-left — landing exactly
    // where the headline starts (x: padX), painting over its first ~2
    // characters. Reserve room for that flipped chip up front by computing
    // where it WOULD land (same geometry/collision logic `logoChipLayer`
    // uses below) and starting the headline to its right, instead of
    // discovering the overlap only after text has already been laid out.
    let headlineStartX = padX;
    if (input.hasLogo) {
      const rightChip = logoChipGeometry(width, height, 'bottom-right');
      if (boxesOverlap(rightChip.box, ctaBox)) {
        const leftChip = logoChipGeometry(width, height, 'bottom-left');
        headlineStartX = Math.max(headlineStartX, leftChip.box.x + leftChip.box.w + gap);
      }
    }
    const availableWidth = Math.max(20, ctaX - headlineStartX - gap);
    const headlineCap = Math.round(clamp(height * 0.3, 16, 30));
    const headlineFloor = 13;
    const fitted = fitHeadlineBlock(
      copy.headline,
      headlineCap,
      headlineFloor,
      1,
      availableWidth,
      height, // single row: height itself is never the binding constraint
    );
    const baselineY = height / 2 + fitted.fontSize * 0.32;
    const headlineBox: Box = {
      x: headlineStartX,
      y: baselineY - fitted.fontSize * TEXT_ASCENT,
      w: Math.min(fitted.width, availableWidth),
      h: textBlockHeight(fitted.fontSize, 1, HEADLINE_LINE_MULT),
    };
    enforceHorizontalGap(headlineBox, ctaBox, MIN_GAP);

    return {
      tier,
      width,
      height,
      padX,
      padY,
      boxes: { headline: headlineBox, subline: null, cta: ctaBox },
      fontSizes: { headline: fitted.fontSize, subline: 0, cta: ctaSize },
      headlineLines: fitted.lines,
      sublineLines: [],
      ctaText: copy.cta,
    };
  }

  if (tier === 'compact') {
    const padY = Math.max(10, Math.round(height * 0.1));
    const ctaSize = Math.round(clamp(height * 0.15, 11, 15));
    const ctaPillH = Math.max(22, Math.round(height * 0.34));
    let ctaW = ctaPillWidth(copy.cta, ctaSize);
    const innerW = width - 2 * padX;
    ctaW = Math.min(ctaW, Math.round(innerW * 0.62));
    const ctaX = Math.max(padX, width - padX - ctaW);
    const ctaY = height - padY - ctaPillH;
    const ctaBox: Box = { x: ctaX, y: ctaY, w: ctaW, h: ctaPillH };

    const bandGap = 10;
    const remainingH = ctaY - bandGap - padY;
    const headlineCap = Math.round(clamp(height * 0.3, 16, 30));
    const headlineFloor = 13;
    const fitted = fitHeadlineBlock(
      copy.headline,
      headlineCap,
      headlineFloor,
      2,
      innerW,
      Math.max(headlineFloor, remainingH),
    );
    const headlineBox: Box = {
      x: padX,
      y: padY,
      w: fitted.width,
      h: fitted.height,
    };
    enforceVerticalGap(headlineBox, ctaBox, MIN_GAP);

    return {
      tier,
      width,
      height,
      padX,
      padY,
      boxes: { headline: headlineBox, subline: null, cta: ctaBox },
      fontSizes: { headline: fitted.fontSize, subline: 0, cta: ctaSize },
      headlineLines: fitted.lines,
      sublineLines: [],
      ctaText: copy.cta,
    };
  }

  // stacked
  const tall = height >= 400;
  const padY = tall
    ? Math.max(16, Math.round(height * 0.14))
    : Math.max(10, Math.round(height * 0.1));
  const headlineCap = Math.round(clamp(width * 0.09, 22, 40));
  const headlineFloor = Math.max(16, headlineCap - 6); // "shrink one step" before ellipsizing
  const sublineSize = Math.round(clamp(width * 0.045, 13, 19));
  const ctaSize = Math.round(clamp(width * 0.038, 12, 16));
  const ctaPillH = Math.max(30, Math.round(height * 0.09));
  const innerW = width - 2 * padX;

  let ctaW = ctaPillWidth(copy.cta, ctaSize);
  ctaW = Math.min(ctaW, innerW);
  const ctaY = height - padY - ctaPillH;
  const ctaBox: Box = { x: padX, y: ctaY, w: ctaW, h: ctaPillH };

  const contentGap = 10;
  const contentTop = padY;
  const contentBottom = ctaY - contentGap;
  const contentRegionH = Math.max(0, contentBottom - contentTop);

  const headlineFitted = fitHeadlineBlock(
    copy.headline,
    headlineCap,
    headlineFloor,
    2,
    innerW,
    contentRegionH,
  );

  const headSubGap = 10;
  const sublineBudget = Math.max(0, contentRegionH - headlineFitted.height - headSubGap);
  const sublineFitted = fitSublineBlock(copy.subline, sublineSize, innerW, sublineBudget);
  const hasSubline = sublineFitted.lines.length > 0;

  const textBlockTotalH =
    headlineFitted.height + (hasSubline ? headSubGap + sublineFitted.height : 0);

  const topAnchor = tall
    ? contentTop + Math.max(0, (contentRegionH - textBlockTotalH) / 2)
    : contentTop;

  const headlineBox: Box = {
    x: padX,
    y: topAnchor,
    w: headlineFitted.width,
    h: headlineFitted.height,
  };
  const sublineBox: Box | null = hasSubline
    ? {
        x: padX,
        y: topAnchor + headlineFitted.height + headSubGap,
        w: sublineFitted.width,
        h: sublineFitted.height,
      }
    : null;

  enforceVerticalGap(headlineBox, sublineBox ?? ctaBox, MIN_GAP);
  if (sublineBox) enforceVerticalGap(sublineBox, ctaBox, MIN_GAP);

  return {
    tier,
    width,
    height,
    padX,
    padY,
    boxes: { headline: headlineBox, subline: sublineBox, cta: ctaBox },
    fontSizes: { headline: headlineFitted.fontSize, subline: sublineSize, cta: ctaSize },
    headlineLines: headlineFitted.lines,
    sublineLines: sublineFitted.lines,
    ctaText: copy.cta,
  };
}

/** Defensive final clamp (fix requirement #3): if `a` (left) somehow
 * intrudes on `b` (right) with less than `minGap` between them, shrink a's
 * box width rather than let the caller draw an overlap. This is a safety
 * net — the tier algorithms above budget space so this should be a no-op —
 * but it makes the no-overlap invariant true by construction, not by luck. */
function enforceHorizontalGap(a: Box, b: Box, minGap: number): void {
  const maxRight = b.x - minGap;
  if (a.x + a.w > maxRight) {
    a.w = Math.max(0, maxRight - a.x);
  }
}

/** Same as `enforceHorizontalGap` but for boxes stacked vertically (a above b). */
function enforceVerticalGap(a: Box, b: Box, minGap: number): void {
  const maxBottom = b.y - minGap;
  if (a.y + a.h > maxBottom) {
    a.h = Math.max(0, maxBottom - a.y);
  }
}

function ctaPillSvg(box: Box, text: string, fontSize: number, bg: string, fg: string): string {
  const ry = box.h / 2;
  return `
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${ry}" fill="${bg}" />
    <text x="${box.x + box.w / 2}" y="${box.y + box.h / 2 + fontSize * 0.35}" font-family="Inter" font-weight="700" font-size="${fontSize}" fill="${fg}" text-anchor="middle">${escapeXml(text)}</text>`;
}

/** Fixed-size logo chip geometry (2026-08-08 design): height-driven box, so
 * extreme aspect ratios of the source logo can't break layout (rendered with
 * `preserveAspectRatio="meet"`). Computed once and shared between the
 * collision check and the SVG emitter so the two can never disagree about
 * where the chip sits. */
function logoChipGeometry(
  width: number,
  height: number,
  anchor: 'bottom-right' | 'bottom-left',
): { box: Box; imgX: number; imgY: number; imgW: number; imgH: number } {
  const imgH = Math.round(Math.min(Math.max(height * 0.18, 20), 56));
  const imgW = Math.round(imgH * 2.5);
  const pad = Math.round(imgH * 0.15);
  const margin = Math.max(8, Math.round(width * 0.03));
  const chipW = imgW + pad * 2;
  const chipH = imgH + pad * 2;
  const x = anchor === 'bottom-left' ? margin : width - margin - chipW;
  const y = height - margin - chipH;
  return { box: { x, y, w: chipW, h: chipH }, imgX: x + pad, imgY: y + pad, imgW, imgH };
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Fixed-position logo chip (2026-08-08 design): white chip so contrast
 * never depends on the logo's colors — same philosophy as SCRIM for text.
 * Height-driven box; extreme aspect ratios cannot break the layout
 * (preserveAspectRatio="meet").
 *
 * Anchor corner is picked per-render, not hardcoded per template: 'bold' and
 * 'light' share the exact same `computeBannerLayout` geometry (only the
 * palette differs), so a static per-template choice would be identically
 * right or identically wrong for both. What actually varies is the CTA
 * pill's position across banner *tiers* — bottom-right in `strip`
 * (728x90, 980x120) and `compact` (320x100), bottom-left in `stacked`
 * (300x250, 300x600). Defaulting to bottom-right and switching to
 * bottom-left only when that would overlap the actual computed CTA box
 * handles every current and future IAB size correctly, instead of guessing
 * per template. See task-4-report.md for the box-math that confirms this
 * avoids CTA collisions across all of IAB_STANDARD_SIZES. */
function logoChipLayer(
  width: number,
  height: number,
  logoPngBase64: string,
  mime: 'image/png' | 'image/jpeg',
  ctaBox: Box | null,
): string {
  const right = logoChipGeometry(width, height, 'bottom-right');
  const geometry =
    ctaBox && boxesOverlap(right.box, ctaBox)
      ? logoChipGeometry(width, height, 'bottom-left')
      : right;
  const { box, imgX, imgY, imgW, imgH } = geometry;
  return `<g class="logo-chip">
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${Math.round(box.h * 0.18)}"
      fill="#ffffff" fill-opacity="0.94" stroke="#e2e8f0" stroke-width="1"/>
    <image href="data:${mime};base64,${logoPngBase64}" x="${imgX}" y="${imgY}"
      width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}

export function renderBannerSvg(input: RenderBannerInput): string {
  const { width, height, copy, templateId } = input;
  const palette = PALETTE[templateId];
  const layout = computeBannerLayout({ width, height, copy, hasLogo: input.logoPng != null });
  const useBackground = templateId === 'bold' && !!input.backgroundPng;
  const backgroundPngBase64 = useBackground
    ? typeof input.backgroundPng === 'string'
      ? input.backgroundPng
      : input.backgroundPng!.toString('base64')
    : null;

  const backgroundLayer = useBackground
    ? `<image href="data:image/png;base64,${backgroundPngBase64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
       <rect x="0" y="0" width="${width}" height="${height}" fill="${SCRIM_COLOR}" fill-opacity="${SCRIM_OPACITY}" />`
    : `<rect x="0" y="0" width="${width}" height="${height}" fill="${palette.bg}" />`;

  const headlineBox = layout.boxes.headline!;
  const headlineFontSize = layout.fontSizes.headline;
  let headline: string;
  if (layout.tier === 'strip') {
    // Single row: vertically centered baseline within the row.
    const baselineY = height / 2 + headlineFontSize * 0.32;
    headline = `<text x="${headlineBox.x}" y="${baselineY}" font-family="Inter" font-weight="800" font-size="${headlineFontSize}" fill="${palette.text}">${escapeXml(layout.headlineLines[0] ?? '')}</text>`;
  } else {
    const firstBaselineY = headlineBox.y + headlineFontSize * TEXT_ASCENT;
    const tspans = layout.headlineLines
      .map(
        (line, i) =>
          `<tspan x="${headlineBox.x}" dy="${i === 0 ? 0 : headlineFontSize * HEADLINE_LINE_MULT}">${escapeXml(line)}</tspan>`,
      )
      .join('');
    headline = `<text x="${headlineBox.x}" y="${firstBaselineY}" font-family="Inter" font-weight="800" font-size="${headlineFontSize}" fill="${palette.text}">${tspans}</text>`;
  }

  let subline = '';
  if (layout.tier === 'stacked' && layout.boxes.subline && layout.sublineLines.length > 0) {
    const sublineBox = layout.boxes.subline;
    const sublineFontSize = layout.fontSizes.subline;
    const firstBaselineY = sublineBox.y + sublineFontSize * TEXT_ASCENT;
    const tspans = layout.sublineLines
      .map(
        (line, i) =>
          `<tspan x="${sublineBox.x}" dy="${i === 0 ? 0 : sublineFontSize * SUBLINE_LINE_MULT}">${escapeXml(line)}</tspan>`,
      )
      .join('');
    subline = `<text x="${sublineBox.x}" y="${firstBaselineY}" font-family="Inter" font-weight="400" font-size="${sublineFontSize}" fill="${palette.sub}">${tspans}</text>`;
  }

  const ctaBox = layout.boxes.cta!;
  const ctaBlock = ctaPillSvg(
    ctaBox,
    layout.ctaText,
    layout.fontSizes.cta,
    palette.ctaBg,
    palette.ctaText,
  );

  const logoPngBase64 =
    input.logoPng == null
      ? null
      : typeof input.logoPng === 'string'
        ? input.logoPng
        : input.logoPng.toString('base64');
  const logoLayer = logoPngBase64
    ? logoChipLayer(width, height, logoPngBase64, input.logoMime ?? 'image/png', ctaBox)
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${backgroundLayer}
${headline}
${subline}
${ctaBlock}
${logoLayer}
</svg>`;
}

export { PALETTE, SCRIM_COLOR, SCRIM_OPACITY };
