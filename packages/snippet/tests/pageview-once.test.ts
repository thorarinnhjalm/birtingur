/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AdResponse } from '../src/types';

const SERVE_BASE = 'https://serve.adplatform.is';

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
