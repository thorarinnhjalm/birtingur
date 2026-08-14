import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as AnalyticsModule from '../src/lib/analytics';

/**
 * The house ad is the ONE creative surface on this platform where a CSS
 * animation actually reaches a viewer.
 *
 * Advertiser creatives are rasterized: apps/api's render-variant.ts turns the
 * SVG template into a PNG and uploads that, so anything animated in the SVG is
 * flattened away before it leaves the server. Measured while reviewing PR #48 —
 * the PNG is byte-identical with and without the animation markup.
 *
 * The house ad is different. routes/ad.ts builds its SVG inline and hands it
 * over as a `data:image/svg+xml` URI, and packages/snippet renders every
 * creative as `<img src=...>`. CSS animations inside an SVG loaded through
 * <img> DO run in modern browsers. What does NOT run there is anything needing
 * pointer input: the SVG document receives no events, so `:hover` and `cursor`
 * are dead rules — which is the same "looks like it works, does nothing" trap
 * this test file exists to keep out.
 */

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    get: async () => null,
    set: async () => 'OK',
    mget: async () => [],
    hgetall: async () => null,
    hincrby: async () => 1,
    expire: async () => 1,
    incr: async () => 1,
    decrby: async () => 0,
    incrby: async () => 1,
    lpush: async () => 1,
    pipeline: () => {
      const p: any = {
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

async function houseAdSvg(query = 'slot=slot_empty&consent=none'): Promise<string> {
  const res = await app.request(`/v1/ad?${query}`);
  const body = await res.json();
  expect(body.creativeId).toBe('cre_fallback_birtingur');
  expect(body.imageUrl).toContain('data:image/svg+xml');
  // The route hands out a percent-encoded data URI; decode back to markup.
  return decodeURIComponent(body.imageUrl.replace('data:image/svg+xml;utf8,', ''));
}

beforeEach(() => {
  process.env.SIGNING_SECRET = 'test-secret';
});

describe('house ad micro-animation', () => {
  it('animates the call to action', async () => {
    const svg = await houseAdSvg();
    expect(svg).toContain('@keyframes');
    expect(svg).toMatch(/animation:\s*[a-zA-Z]/);
  });

  it('honours prefers-reduced-motion', async () => {
    // A looping animation a viewer cannot switch off is an accessibility
    // failure, and this one sits on somebody else's blog on every unfilled
    // impression.
    const svg = await houseAdSvg();
    expect(svg).toContain('prefers-reduced-motion');
    const reduced = svg.slice(svg.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/animation:\s*none/);
  });

  it('carries no rules that need pointer input, because none can ever fire', async () => {
    // An SVG loaded through <img> gets no pointer events. :hover and cursor
    // rules there are decoration that never runs — exactly the class of dead
    // markup this change exists to remove from the rasterized templates.
    const svg = await houseAdSvg();
    expect(svg).not.toContain(':hover');
    expect(svg).not.toContain('cursor:');
  });

  it('animates both layouts that actually have a call to action', async () => {
    // generateHouseAdSvg branches into compact / horizontal / vertical layouts,
    // each building its own markup, so the animation has to reach both branches
    // that draw a button rather than being pasted into one of them.
    for (const [w, h] of [
      [728, 90],
      [300, 250],
    ]) {
      const svg = await houseAdSvg(`slot=slot_empty&consent=none&w=${w}&h=${h}`);
      expect(svg, `${w}x${h} must animate`).toContain('@keyframes');
      expect(svg, `${w}x${h} must apply the class`).toContain('class="cta-pulse"');
    }
  });

  it('ships no animation CSS in the compact layout, which has no button', async () => {
    // 120x60 renders a logo and a wordmark, nothing to pulse. Emitting unused
    // keyframes there would be bytes on the wire doing nothing — the same charge
    // this change levelled at the rasterized templates.
    const svg = await houseAdSvg('slot=slot_empty&consent=none&w=120&h=60');
    expect(svg).not.toContain('@keyframes');
    expect(svg).not.toContain('cta-pulse');
  });

  it('never puts the animated class on the group that positions the button', async () => {
    // A CSS transform overrides the `transform` presentation attribute, so
    // scaling the positioned group would snap the button to the origin on the
    // first frame. The pulse has to scale a wrapper.
    const svg = await houseAdSvg();
    expect(svg).not.toMatch(/class="cta-pulse"[^>]*transform="translate/);
  });

  it('stays a valid single-root SVG', async () => {
    const svg = await houseAdSvg();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect((svg.match(/<svg/g) ?? []).length).toBe(1);
    expect((svg.match(/<style>/g) ?? []).length).toBe(1);
  });

  it('keeps the no-fill response within its byte budget', async () => {
    // This SVG is inlined, percent-encoded, into the JSON body of EVERY unfilled
    // ad request — the most frequent response on a quiet publisher's site. The
    // animation cost 776 bytes written out with indentation and 521 after the
    // whitespace collapse in HOUSE_AD_ANIMATION_CSS, because encodeURIComponent
    // turns every space into three characters. Measured 2026-08-14:
    // 728x90 8152, 300x250 8397, 120x60 6846 (unchanged, no button to pulse).
    //
    // The ceiling leaves room for copy changes but not for another unbudgeted
    // block of markup. If this fails, measure before raising it.
    for (const [w, h] of [
      [728, 90],
      [300, 250],
      [120, 60],
    ]) {
      const res = await app.request(`/v1/ad?slot=slot_empty&consent=none&w=${w}&h=${h}`);
      const body = await res.json();
      expect(body.imageUrl.length, `${w}x${h} house ad`).toBeLessThan(9_000);
    }
  });
});
