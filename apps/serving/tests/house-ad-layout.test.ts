import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IAB_STANDARD_SIZES } from '@ada/shared';
import type * as AnalyticsModule from '../src/lib/analytics';

/**
 * Geometry guard for the house ad.
 *
 * Reported from production on 2026-08-14 with a screenshot: on a phone the
 * banner's subtitle ran underneath the "Auglýsa" button and off the right edge,
 * reading "Sjálfvirkur auglýsingamarkaður • 550 kr. C". This is the house ad
 * Birtingur shows on other people's sites when nothing fills the slot, so a
 * clipped one is the platform advertising itself badly.
 *
 * Cause: the horizontal layout picked its subtitle by HEIGHT (`height >= 80`
 * selects the long pitch) while the constraint that actually binds is WIDTH.
 * The IAB mobile banner is 320x100 — tall enough to qualify for the long text,
 * less than half wide enough to hold it. Measured before the fix: ~324px of
 * text into ~160px of space, a 164px overrun straight through the button.
 *
 * These tests assert the geometry rather than the wording, so they keep holding
 * when the copy changes.
 */

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    get: async () => null,
    set: async () => 'OK',
    mget: async () => [],
    pipeline: () => {
      const p: {
        lpush: () => typeof p;
        incr: () => typeof p;
        expire: () => typeof p;
        hincrby: () => typeof p;
        exec: () => Promise<unknown[]>;
      } = {
        lpush: () => p,
        incr: () => p,
        expire: () => p,
        hincrby: () => p,
        exec: async () => [],
      };
      return p;
    },
  }),
  setRedis: () => {},
}));

vi.mock('../src/lib/cache', () => ({
  getSlotCache: async (slotId: string) =>
    slotId === 'slot_empty'
      ? {
          slotId: 'slot_empty',
          publisherId: 'pub_1',
          sizes: [{ width: 728, height: 90 }],
          pricing: { mode: 'cpm', cpmIsk: 550 },
          activeCreatives: [],
          blockedCategories: [],
          refreshedAt: Date.now(),
        }
      : null,
}));

vi.mock('../src/lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof AnalyticsModule>();
  return { ...actual, logEvent: async () => {} };
});

import { Hono } from 'hono';
import { adRoute } from '../src/routes/ad';

const app = new Hono();
app.route('/v1/ad', adRoute);

async function houseAdSvg(width: number, height: number): Promise<string> {
  const res = await app.request(`/v1/ad?slot=slot_empty&consent=none&w=${width}&h=${height}`);
  const body = await res.json();
  expect(body.creativeId).toBe('cre_fallback_birtingur');
  return decodeURIComponent(body.imageUrl.replace('data:image/svg+xml;utf8,', ''));
}

/**
 * Rough advance width. Deliberately the same crude estimate the layout code
 * uses to decide what fits — the point is that both sides agree, not that
 * either matches a real font metric.
 */
function estimateTextWidth(text: string, fontSize: number, weight: number): number {
  const factor = weight >= 700 ? 0.58 : 0.5;
  return text.length * fontSize * factor;
}

interface TextRun {
  /** Rendered left edge in user units. */
  left: number;
  /** Rendered right edge in user units. */
  right: number;
  text: string;
}

/**
 * Every `<text>` in the banner reduced to its horizontal extent.
 *
 * Handles both anchorings, because the two layouts differ: the horizontal
 * banner left-anchors at an absolute x, while the vertical/square banner
 * centres on `x="50%"`. An earlier version of this helper skipped every
 * `text-anchor="middle"` run to avoid the button's own label, which quietly
 * excluded the entire vertical layout — 300x250 and 300x600, two of the five
 * IAB sizes, were being "covered" by a loop that measured nothing in them.
 *
 * The button label is excluded specifically: it is the only middle-anchored run
 * whose x is not `50%`, since it centres inside the button's own translated
 * group and is bounded by the button, not the canvas.
 */
function textRuns(svg: string, canvasWidth: number): TextRun[] {
  const runs: TextRun[] = [];
  const re = /<text ([^>]*)>([^<]*)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const attrs = m[1]!;
    const text = m[2]!;
    if (!text.trim()) continue;

    const fs = attrs.match(/font-size="([\d.]+)"/);
    if (!fs) continue;
    const fontSize = parseFloat(fs[1]!);
    const fw = attrs.match(/font-weight="(\d+)"/);
    const weight = fw ? parseInt(fw[1]!, 10) : 400;
    const width = estimateTextWidth(text, fontSize, weight);

    const centred = attrs.includes('text-anchor="middle"');
    const xAttr = attrs.match(/\bx="([\d.]+%?)"/);
    if (!xAttr) continue;
    const raw = xAttr[1]!;

    if (centred) {
      if (raw !== '50%') continue; // the button's own label
      const centre = canvasWidth / 2;
      runs.push({ left: centre - width / 2, right: centre + width / 2, text });
    } else {
      if (raw.endsWith('%')) continue;
      const x = parseFloat(raw);
      runs.push({ left: x, right: x + width, text });
    }
  }
  return runs;
}

/** Left edge of the call-to-action button, or null when the layout has none. */
function buttonLeftEdge(svg: string): number | null {
  const m = svg.match(/<g transform="translate\(([\d.]+), [\d.]+\)">\s*<rect/);
  return m ? parseFloat(m[1]!) : null;
}

/**
 * The vertical/square layout stacks its button UNDER the copy rather than
 * beside it, so horizontal overlap with the button is expected there and only
 * the canvas bounds apply. Mirrors generateHouseAdSvg's own branch conditions.
 */
function isStackedLayout(width: number, height: number): boolean {
  const isCompact = width < 200 || height < 80;
  const isHorizontal = width > height * 1.5;
  return !isCompact && !isHorizontal;
}

beforeEach(() => {
  process.env.SIGNING_SECRET = 'test-secret';
});

describe('house ad text never collides with the button or the canvas edge', () => {
  // Every IAB size, plus the legacy non-IAB sizes a slot created before the
  // size validation shipped can still carry.
  const SIZES = [
    ...IAB_STANDARD_SIZES.map((s) => [s.width, s.height] as const),
    [468, 60] as const,
    [160, 600] as const,
    [120, 60] as const,
    [250, 250] as const,
  ];

  for (const [width, height] of SIZES) {
    it(`${width}x${height}: no text runs past the button or off the canvas`, async () => {
      const svg = await houseAdSvg(width, height);
      const buttonX = buttonLeftEdge(svg);
      const runs = textRuns(svg, width);

      // Guards the helper itself: a parser that silently matched nothing would
      // make every assertion below vacuous, which is how the vertical layout
      // went uncovered the first time.
      expect(runs.length, `no text measured at ${width}x${height}`).toBeGreaterThan(0);

      for (const run of runs) {
        expect(run.left, `"${run.text}" starts left of the canvas`).toBeGreaterThanOrEqual(0);
        expect(
          run.right,
          `"${run.text}" runs off the right edge of a ${width}px banner`,
        ).toBeLessThanOrEqual(width);

        // Only text that starts to the LEFT of the button can collide with it;
        // the vertical layout stacks its button below the copy instead.
        if (buttonX !== null && run.left < buttonX && !isStackedLayout(width, height)) {
          expect(
            run.right,
            `"${run.text}" runs under the button at ${width}x${height}`,
          ).toBeLessThanOrEqual(buttonX);
        }
      }
    });
  }

  it('picks a shorter pitch on a narrow banner instead of overflowing', async () => {
    // 320x100 is the IAB Mobile Banner: tall enough that the old
    // `height >= 80` rule handed it the longest subtitle, and nowhere near wide
    // enough to hold it. The long line must not appear here.
    const narrow = await houseAdSvg(320, 100);
    expect(narrow).not.toContain('Sjálfvirkur auglýsingamarkaður');
  });

  it('still uses the full pitch where there is room for it', async () => {
    // The fix must not silently downgrade the leaderboard, which is the size
    // the copy was written for.
    const wide = await houseAdSvg(728, 90);
    expect(wide).toContain('Sjálfvirkur auglýsingamarkaður');
  });
});
