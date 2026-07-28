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

/** Greedy word-wrap into at most `maxLines` lines of ~`maxChars` characters. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

interface Layout {
  headlineSize: number;
  sublineSize: number;
  ctaSize: number;
  showSubline: boolean;
  padX: number;
  padY: number;
  ctaPillH: number;
  stacked: boolean; // vertical stack (tall formats) vs single row (short formats)
}

function layoutFor(width: number, height: number): Layout {
  const compact = height <= 160;
  const padX = Math.max(14, Math.round(width * 0.06));
  const padY = Math.max(10, Math.round(height * 0.1));
  if (compact) {
    return {
      headlineSize: Math.round(Math.min(30, Math.max(16, height * 0.3))),
      sublineSize: 0,
      ctaSize: Math.round(Math.min(15, Math.max(11, height * 0.15))),
      showSubline: false,
      padX,
      padY,
      ctaPillH: Math.round(Math.max(22, height * 0.34)),
      stacked: false,
    };
  }
  return {
    headlineSize: Math.round(Math.min(40, Math.max(22, width * 0.09))),
    sublineSize: Math.round(Math.min(19, Math.max(13, width * 0.045))),
    ctaSize: Math.round(Math.min(16, Math.max(12, width * 0.038))),
    showSubline: true,
    padX,
    padY,
    ctaPillH: Math.round(Math.max(30, height * 0.09)),
    stacked: true,
  };
}

function ctaPill(
  x: number,
  y: number,
  text: string,
  fontSize: number,
  pillH: number,
  bg: string,
  fg: string,
): string {
  const pillW = Math.round(text.length * fontSize * 0.62 + fontSize * 2.2);
  const ry = pillH / 2;
  return `
    <rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="${ry}" fill="${bg}" />
    <text x="${x + pillW / 2}" y="${y + pillH / 2 + fontSize * 0.35}" font-family="Inter" font-weight="700" font-size="${fontSize}" fill="${fg}" text-anchor="middle">${escapeXml(text)}</text>`;
}

export function renderBannerSvg(input: RenderBannerInput): string {
  const { width, height, copy, templateId } = input;
  const palette = PALETTE[templateId];
  const layout = layoutFor(width, height);
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

  const headlineLines = wrapText(
    copy.headline,
    Math.max(10, Math.round(width / (layout.headlineSize * 0.52))),
    layout.stacked ? 2 : 1,
  );
  const sublineLines = layout.showSubline
    ? wrapText(copy.subline, Math.max(14, Math.round(width / (layout.sublineSize * 0.5))), 2)
    : [];

  let textBlock: string;
  let ctaBlock: string;

  if (layout.stacked) {
    // Vertical stack: headline, then subline, then CTA pill — used for the
    // taller/squarer formats (300x250, 300x600) which have room to breathe.
    const startY = layout.padY + layout.headlineSize;
    const headlineTspans = headlineLines
      .map(
        (line, i) =>
          `<tspan x="${layout.padX}" dy="${i === 0 ? 0 : layout.headlineSize * 1.12}">${escapeXml(line)}</tspan>`,
      )
      .join('');
    const headline = `<text x="${layout.padX}" y="${startY}" font-family="Inter" font-weight="800" font-size="${layout.headlineSize}" fill="${palette.text}">${headlineTspans}</text>`;

    const sublineStartY =
      startY + headlineLines.length * layout.headlineSize * 1.12 + layout.sublineSize * 0.6 + 8;
    const sublineTspans = sublineLines
      .map(
        (line, i) =>
          `<tspan x="${layout.padX}" dy="${i === 0 ? 0 : layout.sublineSize * 1.3}">${escapeXml(line)}</tspan>`,
      )
      .join('');
    const subline = `<text x="${layout.padX}" y="${sublineStartY}" font-family="Inter" font-weight="400" font-size="${layout.sublineSize}" fill="${palette.sub}">${sublineTspans}</text>`;

    textBlock = headline + subline;
    const ctaY = height - layout.padY - layout.ctaPillH;
    ctaBlock = ctaPill(
      layout.padX,
      ctaY,
      copy.cta,
      layout.ctaSize,
      layout.ctaPillH,
      palette.ctaBg,
      palette.ctaText,
    );
  } else {
    // Single row: headline left, CTA pill right — used for the short/wide
    // formats (728x90, 320x100, 980x120) where there's no vertical room for
    // a subline.
    const centerY = height / 2 + layout.headlineSize * 0.32;
    const headline = `<text x="${layout.padX}" y="${centerY}" font-family="Inter" font-weight="800" font-size="${layout.headlineSize}" fill="${palette.text}">${escapeXml(headlineLines[0] ?? copy.headline)}</text>`;
    textBlock = headline;
    const ctaY = (height - layout.ctaPillH) / 2;
    const ctaX =
      width -
      layout.padX -
      Math.round(copy.cta.length * layout.ctaSize * 0.62 + layout.ctaSize * 2.2);
    ctaBlock = ctaPill(
      ctaX,
      ctaY,
      copy.cta,
      layout.ctaSize,
      layout.ctaPillH,
      palette.ctaBg,
      palette.ctaText,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${backgroundLayer}
${textBlock}
${ctaBlock}
</svg>`;
}

export { PALETTE, SCRIM_COLOR, SCRIM_OPACITY };
