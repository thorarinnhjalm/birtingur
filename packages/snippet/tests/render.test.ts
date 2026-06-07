/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

// Stub IntersectionObserver so viewability fires immediately in tests
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // Immediately simulate 100% visibility
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  process.env.SERVE_BASE = SERVE_BASE;
  document.body.innerHTML = '';
  vi.useFakeTimers();
  (globalThis as any).IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('renderAd cross-origin tracking URLs', () => {
  it('resolves a relative impression pixel against SERVE_BASE after viewability delay', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    renderAd(el, makeAd());

    // Pixel fires after 1s viewability delay (IAB standard)
    vi.advanceTimersByTime(1000);

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

describe('renderAd empty response tracking', () => {
  it('fires the tracking pixel even for empty responses', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    renderAd(el, {
      empty: true,
      impressionPixel: '/v1/impression?c=cre_nocache&s=slot_xyz&type=pageview',
    });

    // Element should be hidden
    expect(el.style.display).toBe('none');

    // But the tracking pixel should still fire after viewability delay
    vi.advanceTimersByTime(1000);
    const pixel = el.querySelector('img[src*="/v1/impression"]') as HTMLImageElement | null;
    expect(pixel).toBeTruthy();
    expect(pixel!.src).toContain('cre_nocache');
  });

  it('does not fire a pixel when impressionPixel is absent', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    renderAd(el, { empty: true });

    vi.advanceTimersByTime(1000);
    const pixel = el.querySelector('img[src*="/v1/impression"]') as HTMLImageElement | null;
    expect(pixel).toBeNull();
  });
});
