import { describe, it, expect } from 'vitest';
import { IAB_STANDARD_SIZES } from '@ada/shared';
import { renderBannerSvg, SCRIM_COLOR, SCRIM_OPACITY } from '../src/services/ai-creative/templates';
import { renderSvgToPng } from '../src/services/ai-creative/render';

const COPY = {
  headline: 'Sumarútsala hafin',
  subline: 'Allt að 40% afsláttur af völdum vörum',
  cta: 'Sjá nánar',
};

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
