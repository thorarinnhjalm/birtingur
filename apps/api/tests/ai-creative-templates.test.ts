import { describe, it, expect } from 'vitest';
import { IAB_STANDARD_SIZES } from '@ada/shared';
import type { GeneratedCopyVariant } from '@ada/shared';
import {
  renderBannerSvg,
  computeBannerLayout,
  SCRIM_COLOR,
  SCRIM_OPACITY,
  type Box,
} from '../src/services/ai-creative/templates';
import { renderSvgToPng } from '../src/services/ai-creative/render';

const COPY = {
  headline: 'Sumarútsala hafin',
  subline: 'Allt að 40% afsláttur af völdum vörum',
  cta: 'Sjá nánar',
};

/** Minimal valid renderBannerSvg input (300x250), reused by tests that only
 * care about one specific input field and don't want to repeat the rest. */
function baseInput(): { width: number; height: number; copy: GeneratedCopyVariant } {
  return { width: 300, height: 250, copy: COPY };
}

describe('renderBannerSvg', () => {
  it('produces a valid SVG root element sized to the requested dimensions for every IAB size, in both templates', () => {
    for (const size of IAB_STANDARD_SIZES) {
      for (const templateId of ['bold', 'light'] as const) {
        const svg = renderBannerSvg({
          width: size.width,
          height: size.height,
          copy: COPY,
          templateId,
        });
        expect(svg).toContain(`width="${size.width}" height="${size.height}"`);
        expect(svg.trim().startsWith('<svg')).toBe(true);
        expect(svg.trim().endsWith('</svg>')).toBe(true);
      }
    }
  });

  it('escapes XML-special characters in AI-provided copy so the SVG stays well-formed', () => {
    const svg = renderBannerSvg({
      width: 300,
      height: 250,
      copy: { headline: 'A & B <script>', subline: '"quoted" text', cta: "It's <here>" },
      templateId: 'bold',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('renders every IAB size end-to-end to a non-trivial PNG (rasterization actually works)', () => {
    for (const size of IAB_STANDARD_SIZES) {
      const svg = renderBannerSvg({
        width: size.width,
        height: size.height,
        copy: COPY,
        templateId: 'bold',
      });
      const png = renderSvgToPng(svg);
      // A blank/broken render (e.g. missing font) still produces *some* PNG
      // bytes, so assert a floor comfortably above an empty flat rect to
      // catch a silent text-rendering regression, not just a crash.
      expect(png.length).toBeGreaterThan(300);
    }
  });

  it('composites a background image only on the bold template, never on light', () => {
    const fakeBg = Buffer.from(renderSvgPng1x1());
    const bold = renderBannerSvg({
      width: 300,
      height: 250,
      copy: COPY,
      templateId: 'bold',
      backgroundPng: fakeBg,
    });
    const light = renderBannerSvg({
      width: 300,
      height: 250,
      copy: COPY,
      templateId: 'light',
      backgroundPng: fakeBg,
    });
    expect(bold).toContain('<image');
    expect(light).not.toContain('<image');
  });
});

/**
 * Regression net for the reported CTA/headline overlap bug: the old
 * `layoutFor`+non-stacked-branch code left-anchored the headline and
 * right-anchored the CTA pill with NO shared width budget, so a headline
 * near the 30-char schema max at 320x100 overlapped the pill. Confirmed
 * against the pre-fix code by extracting the actual emitted SVG for a
 * 320x100 headline ("Rosalega frabaert", 17 chars) — before the fix, the
 * headline `<text>` started at x=19 with font-size 30 (estimated right edge
 * ≈ 19 + 17*30*0.52 ≈ 284px) while the CTA `<rect>` started at x=110, a
 * ~174px overlap. `computeBannerLayout` is the fix: every element's box is
 * computed up front, the CTA (which never shrinks) is budgeted first, and
 * the headline fits itself — by shrinking font size, then wrapping, then
 * ellipsizing — into whatever width/height is left.
 */
describe('computeBannerLayout — collision-free-by-construction geometry', () => {
  function boxesIntersect(a: Box, b: Box): boolean {
    const separatedX = a.x + a.w <= b.x || b.x + b.w <= a.x;
    const separatedY = a.y + a.h <= b.y || b.y + b.h <= a.y;
    return !(separatedX || separatedY);
  }

  /** Shortest gap between two boxes along whichever axis separates them;
   * negative means they overlap. */
  function gapBetween(a: Box, b: Box): number {
    if (a.x + a.w <= b.x) return b.x - (a.x + a.w);
    if (b.x + b.w <= a.x) return a.x - (b.x + b.w);
    if (a.y + a.h <= b.y) return b.y - (a.y + a.h);
    if (b.y + b.h <= a.y) return a.y - (b.y + b.h);
    return -1;
  }

  function assertNoOverlaps(
    boxes: Record<'headline' | 'subline' | 'cta', Box | null>,
    width: number,
    height: number,
  ) {
    const present = Object.values(boxes).filter((b): b is Box => b !== null);
    // Every box lies fully inside the canvas.
    for (const box of present) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(width + 0.01);
      expect(box.y + box.h).toBeLessThanOrEqual(height + 0.01);
    }
    // No two boxes intersect, and at least an 8px gap between any pair.
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        expect(boxesIntersect(present[i]!, present[j]!)).toBe(false);
        expect(gapBetween(present[i]!, present[j]!)).toBeGreaterThanOrEqual(8);
      }
    }
  }

  // Three copy profiles, all with Icelandic diacritics (þ, ð, æ, ö) so the
  // width-estimate math is exercised against real Icelandic text, not just
  // ASCII. `slice` guarantees the max-length profile sits exactly at the
  // schema caps (headline 30 / subline 60 / cta 15) regardless of exact
  // character counts above.
  const COPY_PROFILES: Record<string, GeneratedCopyVariant> = {
    maxLength: {
      headline: 'Þú færð glæsilegt tilboð í dag, ekki missa af þessu'.slice(0, 30),
      subline: 'Kynntu þér ótrúlegt tilboð sem gildir öllum viðskiptavinum í dag'.slice(0, 60),
      cta: 'Sjáðu tilboðin strax'.slice(0, 15),
    },
    typical: {
      headline: 'Þú átt skilið gæði',
      subline: 'Sjáðu nýja vöruúrvalið hjá okkur núna',
      cta: 'Skoða vörur',
    },
    minimal: {
      headline: 'Þetta æði',
      subline: 'Gæði á góðu verði',
      cta: 'Sjá öll tilboð',
    },
  };

  describe('property sweep: every IAB size × both templates × three copy profiles', () => {
    for (const size of IAB_STANDARD_SIZES) {
      for (const [profileName, copy] of Object.entries(COPY_PROFILES)) {
        it(`${size.width}x${size.height} (${size.name}) / ${profileName}: no overlapping boxes, all in-bounds`, () => {
          const layout = computeBannerLayout({ width: size.width, height: size.height, copy });
          assertNoOverlaps(layout.boxes, size.width, size.height);
        });

        for (const templateId of ['bold', 'light'] as const) {
          it(`${size.width}x${size.height} / ${profileName} / ${templateId}: renderBannerSvg produces well-formed, correctly-sized SVG`, () => {
            const svg = renderBannerSvg({
              width: size.width,
              height: size.height,
              copy,
              templateId,
            });
            expect(svg).toContain(`width="${size.width}" height="${size.height}"`);
            expect(svg.trim().startsWith('<svg')).toBe(true);
            expect(svg.trim().endsWith('</svg>')).toBe(true);
          });
        }
      }
    }
  });

  it('THE regression case: schema-max (30-char) headline at 320x100 does not overlap the CTA pill', () => {
    // This exact case overlapped under the pre-fix layoutFor()/non-stacked
    // branch — see the file-level comment above for the concrete before
    // numbers extracted from the old code's SVG output.
    const copy: GeneratedCopyVariant = {
      headline: 'Þú færð glæsilegt tilboð í dag, ekki missa af þessu'.slice(0, 30),
      subline: 'Kynntu þér ótrúlegt tilboð sem gildir öllum viðskiptavinum'.slice(0, 60),
      cta: 'Sjáðu tilboðin strax'.slice(0, 15),
    };
    const layout = computeBannerLayout({ width: 320, height: 100, copy });
    expect(layout.tier).toBe('compact');
    assertNoOverlaps(layout.boxes, 320, 100);

    // Also assert against the raw rendered SVG, not just the geometry model,
    // so a mismatch between the two (fix requirement #4) would be caught.
    const svg = renderBannerSvg({ width: 320, height: 100, copy, templateId: 'bold' });
    const headlineBox = layout.boxes.headline!;
    const ctaBox = layout.boxes.cta!;
    expect(svg).toContain(`x="${ctaBox.x}"`);
    // compact tier stacks headline-band-then-CTA-band vertically (CTA is
    // bottom-right, not beside the headline), so the guaranteed gap is
    // vertical, not horizontal.
    expect(headlineBox.y + headlineBox.h + 8).toBeLessThanOrEqual(ctaBox.y);
  });

  describe('compact tier (320x100): 2-line wrap preferred over a dangling, un-ellipsized fragment', () => {
    // Regression for the visual-QA finding: a max-length (30-char), multi-word
    // headline used to come out as a truncated fragment ("Þórðargleði í") with
    // no ellipsis, because wrapText silently dropped every word past the
    // first overflow once it thought it had run out of line budget. The fix
    // means the full headline must now either (a) wrap across up to 2 lines
    // in its entirety, or (b) if truly nothing fits, ellipsize with "…" — it
    // must never come back as a partial, un-ellipsized fragment.
    const headline = 'Þórðargleði í öllum sínum dýrð og krafti'.slice(0, 30);

    it('wraps the full headline across (up to) 2 lines, or ellipsizes — never a dangling fragment', () => {
      const copy: GeneratedCopyVariant = {
        headline,
        subline: 'stutt',
        cta: 'Kaupa núna',
      };
      const layout = computeBannerLayout({ width: 320, height: 100, copy });
      expect(layout.tier).toBe('compact');
      expect(layout.headlineLines.length).toBeLessThanOrEqual(2);

      const joined = layout.headlineLines.join(' ');
      if (joined.includes('…')) {
        // Truncated as a last resort — must end with the ellipsis marker,
        // not a bare dropped-word fragment.
        expect(joined.trimEnd().endsWith('…')).toBe(true);
      } else {
        // Preferred outcome: the FULL headline made it in, just wrapped.
        expect(joined).toBe(headline);
      }
    });
  });

  describe('ellipsis behavior: an absurdly long single (unspaceable) word never overflows', () => {
    // No spaces at all — wrapText cannot break this into multiple lines, so
    // the only way to keep it inside its box is font-shrinking followed by
    // hard ellipsis truncation.
    const longWord = 'Óaðskiljanlegurorðöskurþannigmeðengumbilumaðskiljaþaðíneinnveg';

    for (const size of IAB_STANDARD_SIZES) {
      it(`${size.width}x${size.height}: long unspaceable headline stays in-bounds, truncates with … when it can't fit`, () => {
        const copy: GeneratedCopyVariant = {
          headline: longWord,
          subline: 'stutt undirtexti með íslenskum stöfum',
          cta: 'Kaupa núna',
        };
        const layout = computeBannerLayout({ width: size.width, height: size.height, copy });
        const headlineBox = layout.boxes.headline!;
        expect(headlineBox.x + headlineBox.w).toBeLessThanOrEqual(size.width + 0.5);
        expect(headlineBox.y + headlineBox.h).toBeLessThanOrEqual(size.height + 0.5);

        const renderedText = layout.headlineLines.join('');
        if (renderedText.length < longWord.length) {
          // It was truncated to fit — must end with the ellipsis marker.
          expect(layout.headlineLines.some((l) => l.includes('…'))).toBe(true);
        } else {
          // It fit at some font size without truncation — still must not overflow.
          expect(renderedText).toBe(longWord);
        }
      });
    }
  });

  // Fix 5 (adversarial review): fitSublineBlock used to return `{ lines: [] }`
  // whenever a single unbroken token overflowed maxWidth at both line counts
  // tried (2, then 1) — the subline vanished entirely instead of truncating,
  // unlike the headline's own ellipsize fallback. Only the 'stacked' tier
  // (300x250, 300x600) ever shows a subline at all — 'strip' and 'compact'
  // never set sublineLines regardless of copy, so this is scoped to those.
  describe('Fix 5: subline ellipsizes instead of vanishing on a long unbroken token', () => {
    const longWord = 'Óaðskiljanlegurorðöskurþannigmeðengumbilumaðskiljaþaðíneinnveg';
    const stackedSizes = IAB_STANDARD_SIZES.filter((s) => s.width === 300);

    for (const size of stackedSizes) {
      it(`${size.width}x${size.height}: long unbroken subline token truncates with … instead of disappearing`, () => {
        const copy: GeneratedCopyVariant = {
          headline: 'Stutt fyrirsögn',
          subline: longWord,
          cta: 'Kaupa núna',
        };
        const layout = computeBannerLayout({ width: size.width, height: size.height, copy });

        expect(layout.sublineLines.length).toBeGreaterThan(0);
        const rendered = layout.sublineLines.join('');
        expect(rendered.endsWith('…')).toBe(true);

        const sublineBox = layout.boxes.subline!;
        expect(sublineBox.x + sublineBox.w).toBeLessThanOrEqual(size.width + 0.5);
        expect(sublineBox.y + sublineBox.h).toBeLessThanOrEqual(size.height + 0.5);
      });
    }
  });
});

// Minimal 1x1 transparent PNG bytes, used only to prove the <image> tag is
// emitted — content doesn't matter for this test.
function renderSvgPng1x1(): Uint8Array {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
}

/**
 * WCAG contrast proof for the 'bold' template's scrim: white foreground text
 * on top of SCRIM_COLOR@SCRIM_OPACITY, composited over the worst-case
 * generated-background pixel (pure white — the least favorable case for
 * white text, since anything darker only helps). If this ever drops below
 * 4.5:1 (WCAG AA, normal text) the scrim constants in templates.ts must be
 * adjusted — this test exists so a casual tweak of SCRIM_OPACITY can't
 * silently break banner readability.
 */
describe('bold-template scrim WCAG contrast', () => {
  function srgbToLinear(c: number): number {
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  function relativeLuminance([r, g, b]: [number, number, number]): number {
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  }
  function contrastRatio(l1: number, l2: number): number {
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  }
  function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  it('keeps white text at >= 4.5:1 contrast even over a pure-white worst-case background', () => {
    const scrim = hexToRgb(SCRIM_COLOR);
    const whiteBg: [number, number, number] = [1, 1, 1];
    const blended: [number, number, number] = [0, 1, 2].map(
      (i) => whiteBg[i]! * (1 - SCRIM_OPACITY) + scrim[i]! * SCRIM_OPACITY,
    ) as [number, number, number];

    const textLuminance = relativeLuminance([1, 1, 1]); // white text = 1.0
    const bgLuminance = relativeLuminance(blended);
    const ratio = contrastRatio(textLuminance, bgLuminance);

    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('logo compositing', () => {
  for (const templateId of ['bold', 'light'] as const) {
    it(`renders the logo chip in the ${templateId} template when logoPng is set`, () => {
      const svg = renderBannerSvg({ ...baseInput(), templateId, logoPng: TINY_PNG_B64 });
      expect(svg).toContain(`data:image/png;base64,${TINY_PNG_B64}`);
      expect(svg).toContain('class="logo-chip"');
    });

    it(`omits the logo entirely in ${templateId} when logoPng is null`, () => {
      const svg = renderBannerSvg({ ...baseInput(), templateId, logoPng: null });
      expect(svg).not.toContain('logo-chip');
    });
  }

  it('uses the jpeg mime in the data URI when logoMime says so', () => {
    const svg = renderBannerSvg({
      ...baseInput(),
      templateId: 'bold',
      logoPng: TINY_PNG_B64,
      logoMime: 'image/jpeg',
    });
    expect(svg).toContain('data:image/jpeg;base64,');
  });

  it('still renders a valid PNG through resvg with a logo present', () => {
    const svg = renderBannerSvg({ ...baseInput(), templateId: 'bold', logoPng: TINY_PNG_B64 });
    const png = renderSvgToPng(svg);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });

  /** Pins the corner-flip decision (see `logoChipLayer` in templates.ts):
   * `strip`/`compact` tiers right-anchor the CTA, so the default bottom-right
   * chip must flip to bottom-left; `stacked` tiers left-anchor the CTA, so
   * the default bottom-right chip must stay put. Asserts on which HALF of
   * the canvas the chip's `x` falls in, not exact pixels, so this survives
   * tweaks to the chip's size/margin constants while still pinning which
   * branch of the flip logic fired. */
  function extractLogoChipX(svg: string): number {
    const match = svg.match(/<g class="logo-chip">\s*<rect x="([\d.]+)"/);
    if (!match) throw new Error('logo-chip rect not found in SVG');
    return Number(match[1]);
  }

  it('flips the chip to the left half on a strip-tier size (728x90) where the default corner would overlap the CTA', () => {
    const svg = renderBannerSvg({
      width: 728,
      height: 90,
      copy: COPY,
      templateId: 'bold',
      logoPng: TINY_PNG_B64,
    });
    const chipX = extractLogoChipX(svg);
    expect(chipX).toBeLessThan(728 / 2);
  });

  it('keeps the chip in the right half on a stacked-tier size (300x250) where the default corner clears the CTA', () => {
    const svg = renderBannerSvg({ ...baseInput(), templateId: 'bold', logoPng: TINY_PNG_B64 });
    const chipX = extractLogoChipX(svg);
    expect(chipX).toBeGreaterThan(300 / 2);
  });

  // CRITICAL-3 (adversarial review): on strip-tier sizes the CTA collision
  // always flips the logo chip to bottom-left, which — before this fix —
  // always overlapped the headline's starting x (padX), painting the white
  // chip over the first ~2 characters of the headline (fill-opacity 0.94,
  // painted last in the SVG so it's on top). computeBannerLayout now
  // reserves room for the flipped chip and shifts the headline right of it
  // when hasLogo is set.
  function extractChipRect(svg: string): Box {
    const match = svg.match(
      /<g class="logo-chip">\s*<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/,
    );
    if (!match) throw new Error('logo-chip rect not found in SVG');
    return { x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) };
  }
  function boxesOverlap(a: Box, b: Box): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  for (const [w, h] of [
    [728, 90],
    [980, 120],
  ] as const) {
    it(`keeps the logo chip clear of the headline text on strip-tier ${w}x${h}`, () => {
      const svg = renderBannerSvg({
        width: w,
        height: h,
        copy: COPY,
        templateId: 'bold',
        logoPng: TINY_PNG_B64,
      });
      const chipBox = extractChipRect(svg);
      const layout = computeBannerLayout({ width: w, height: h, copy: COPY, hasLogo: true });
      const headlineBox = layout.boxes.headline!;
      expect(boxesOverlap(chipBox, headlineBox)).toBe(false);

      // 728x90's chip must still flip to the left half (existing corner-flip
      // contract, pinned above) — the fix must not change WHICH corner it
      // picks, only make the headline get out of its way.
      if (w === 728 && h === 90) {
        expect(chipBox.x).toBeLessThan(w / 2);
      }
    });
  }
});
