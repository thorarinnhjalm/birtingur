/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AdResponse } from '../src/types';

const SERVE_BASE = 'https://serving.birtingur.app';

let firedSrcs: string[];

function mockFetchAd(response: AdResponse | null): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (response === null) {
      return { ok: false, json: async () => ({}) } as Response;
    }
    return { ok: true, json: async () => response } as Response;
  });
}

function firedUrls(): string[] {
  return firedSrcs;
}

/** Like mockFetchAd, but resolves a different response per slot id — parsed out of the
 * requested URL's `slot=` query param — so a test can simulate one slot being a cache
 * miss (no pageviewPixel, per IMPORTANT-2) while another slot on the same page is a
 * normal cache hit (has one). */
function mockFetchAdBySlot(responses: Record<string, AdResponse | null>): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const slotId = new URL(url).searchParams.get('slot') ?? '';
    const response = responses[slotId] ?? null;
    if (response === null) {
      return { ok: false, json: async () => ({}) } as Response;
    }
    return { ok: true, json: async () => response } as Response;
  });
}

// Re-imports the snippet entrypoint with a fresh module registry so the
// module-scoped `pageviewFired` guard in render.ts starts false for every
// test, matching a real page load. index.ts runs `init()` as a side effect
// on import (document.readyState is already 'complete' in jsdom), so the DOM
// must be populated and fetch mocked before calling this.
async function initAndSettle(): Promise<void> {
  vi.resetModules();
  await import('../src/index');
  // Flush the fetchAd() -> res.json() -> .then(renderAd) microtask chain.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  // Guarantee every test starts from a genuinely fresh module registry —
  // independent of test execution/filter order — so the "doubly-included
  // tag" tests below can rely on the first `import('../src/render')` inside
  // each test being a first-time evaluation, not a module cached from a
  // previous test case.
  vi.resetModules();
  process.env.SERVE_BASE = SERVE_BASE;
  document.body.innerHTML = '';
  firedSrcs = [];
  // The one-shot guard lives on globalThis (not module scope) so it survives
  // a doubly-included <script> tag re-evaluating the snippet module — see
  // render.ts. That means it does NOT reset with vi.resetModules() the way
  // module-scoped state would, so it must be cleared by hand between tests.
  delete (globalThis as unknown as Record<string, unknown>)['__adpPageviewFired'];
  // Observe fired pixels by spying on the real appendChild rather than
  // faking the Image constructor: `new Image()` in jsdom already produces a
  // genuine HTMLImageElement, and a fake non-Node stand-in would make
  // `document.body.appendChild(pixel)` throw jsdom's WebIDL type check —
  // which render.ts's caller (index.ts) happens to swallow via try/catch,
  // silently hiding real append failures. Spying on the real DOM call keeps
  // the test honest about what actually reaches the page.
  vi.spyOn(document.body, 'appendChild').mockImplementation(((node: Node) => {
    const src = (node as unknown as { src?: string }).src;
    if (typeof src === 'string') firedSrcs.push(src);
    return node;
  }) as typeof document.body.appendChild);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('one page view per page load', () => {
  it('fires exactly one pageview pixel when three slots each return one', async () => {
    document.body.innerHTML = `
      <div data-adplatform-slot="slot_1"></div>
      <div data-adplatform-slot="slot_2"></div>
      <div data-adplatform-slot="slot_3"></div>`;
    mockFetchAd({ empty: true, pageviewPixel: '/v1/pageview?s=slot_1&ts=1&sig=x' });

    await initAndSettle();

    expect(firedUrls().filter((u) => u.includes('/v1/pageview'))).toHaveLength(1);
  });

  it('still fires the pageview when the only slot returns a no-fill response', async () => {
    document.body.innerHTML = `<div data-adplatform-slot="slot_1"></div>`;
    mockFetchAd({ empty: true, pageviewPixel: '/v1/pageview?s=slot_1&ts=1&sig=x' });

    await initAndSettle();

    expect(firedUrls().filter((u) => u.includes('/v1/pageview'))).toHaveLength(1);
  });

  it('fires no pageview when the ad request fails entirely', async () => {
    document.body.innerHTML = `<div data-adplatform-slot="slot_1"></div>`;
    mockFetchAd(null);

    await initAndSettle();

    expect(firedUrls().filter((u) => u.includes('/v1/pageview'))).toHaveLength(0);
  });

  it('still reports the page view from a later, cached slot when the first slot is a true cache miss', async () => {
    // IMPORTANT-2 (2026-08-09 fix wave): cache-miss (`!slot`) responses from
    // apps/serving no longer carry a pageviewPixel at all — they return
    // fastest of all, and handing one out would systematically win this
    // exact race and burn the page's one true page view on a slot the server
    // couldn't even attribute. slot_1 here simulates that cache miss (no
    // pageviewPixel); slot_2 is a normal cache hit and must be the one that
    // ends up reporting the page view.
    document.body.innerHTML = `
      <div data-adplatform-slot="slot_1"></div>
      <div data-adplatform-slot="slot_2"></div>`;
    mockFetchAdBySlot({
      slot_1: {
        empty: true,
        impressionPixel: '/v1/impression?c=cre_nocache&s=slot_1&type=pageview',
      },
      slot_2: { empty: true, pageviewPixel: '/v1/pageview?s=slot_2&ts=1&sig=y' },
    });

    await initAndSettle();

    const pageviewUrls = firedUrls().filter((u) => u.includes('/v1/pageview'));
    expect(pageviewUrls).toHaveLength(1);
    expect(pageviewUrls[0]).toBe(`${SERVE_BASE}/v1/pageview?s=slot_2&ts=1&sig=y`);
  });

  it('resolves the pixel against SERVE_BASE like other pixels', async () => {
    document.body.innerHTML = `<div data-adplatform-slot="slot_1"></div>`;
    mockFetchAd({ empty: true, pageviewPixel: '/v1/pageview?s=slot_1&ts=1&sig=x' });

    await initAndSettle();

    const pageviewUrls = firedUrls().filter((u) => u.includes('/v1/pageview'));
    expect(pageviewUrls[0]).toBe(`${SERVE_BASE}/v1/pageview?s=slot_1&ts=1&sig=x`);
  });
});

describe('page-view guard survives a doubly-included tag', () => {
  it('fires exactly one pixel when firePageviewOnce is called twice back-to-back (two script tags racing to fire the same page load)', async () => {
    const { firePageviewOnce } = await import('../src/render');

    firePageviewOnce('/v1/pageview?s=slot_1&ts=1&sig=x');
    firePageviewOnce('/v1/pageview?s=slot_1&ts=1&sig=x');

    expect(firedUrls().filter((u) => u.includes('/v1/pageview'))).toHaveLength(1);
  });

  it('still refuses to fire after a full module reset — the guard is not module-scoped', async () => {
    // First "script tag": import render.ts fresh and fire the page view.
    const first = await import('../src/render');
    first.firePageviewOnce('/v1/pageview?s=slot_1&ts=1&sig=x');
    expect(firedUrls().filter((u) => u.includes('/v1/pageview'))).toHaveLength(1);

    // Second "script tag": a classic IIFE build gives a browser a completely
    // fresh module scope on each <script src> evaluation, so re-import with
    // a reset module registry to get a genuinely new copy of render.ts — if
    // the guard were still module-scoped (the bug this test guards against),
    // this second copy would have its own fresh `pageviewFired = false` and
    // would fire again.
    vi.resetModules();
    const second = await import('../src/render');
    second.firePageviewOnce('/v1/pageview?s=slot_1&ts=1&sig=x');

    expect(firedUrls().filter((u) => u.includes('/v1/pageview'))).toHaveLength(1);
  });
});
