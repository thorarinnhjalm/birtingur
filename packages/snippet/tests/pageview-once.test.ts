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
  process.env.SERVE_BASE = SERVE_BASE;
  document.body.innerHTML = '';
  firedSrcs = [];
  class MockImage {
    private _src = '';
    style: Record<string, string> = {};
    constructor(_w?: number, _h?: number) {}
    set src(v: string) {
      this._src = v;
      firedSrcs.push(v);
    }
    get src(): string {
      return this._src;
    }
  }
  (globalThis as unknown as { Image: unknown }).Image = MockImage;
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
