/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderAd } from '../src/render';
import type { AdResponse } from '../src/types';

const SERVE_BASE = 'https://serve.adplatform.is';

function makeAd(overrides: Partial<AdResponse> = {}): AdResponse {
  return {
    creativeId: 'cre_a',
    imageUrl: 'https://cdn.example.com/banner.png',
    clickUrl: '/v1/click?c=cre_a&s=slot_1',
    impressionPixel: '/v1/impression?c=cre_a&s=slot_1',
    width: 300,
    height: 250,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.SERVE_BASE = SERVE_BASE;
  document.body.innerHTML = '';
});

describe('renderAd cross-origin tracking URLs', () => {
  it('resolves a relative impression pixel against SERVE_BASE, not the publisher origin', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    renderAd(el, makeAd());

    const pixel = el.querySelector('img[src*="/v1/impression"]') as HTMLImageElement | null;
    expect(pixel).toBeTruthy();
    expect(pixel!.src).toBe(`${SERVE_BASE}/v1/impression?c=cre_a&s=slot_1`);
  });

  it('resolves a relative click URL against SERVE_BASE', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    renderAd(el, makeAd());

    const a = el.querySelector('a') as HTMLAnchorElement | null;
    expect(a).toBeTruthy();
    expect(a!.href).toBe(`${SERVE_BASE}/v1/click?c=cre_a&s=slot_1`);
  });

  it('leaves an already-absolute click URL (house ad) untouched', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    renderAd(
      el,
      makeAd({
        creativeId: 'cre_fallback_birtingur',
        imageUrl: 'data:image/svg+xml;utf8,xxx',
        clickUrl: 'https://birtingur.app',
        impressionPixel: '/v1/impression?c=cre_fallback_birtingur&s=slot_1&type=pageview',
      }),
    );

    const a = el.querySelector('a') as HTMLAnchorElement | null;
    expect(a!.href).toBe('https://birtingur.app/');
  });
});
