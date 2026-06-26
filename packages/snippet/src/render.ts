import type { AdResponse } from './types';

declare const process: { env: { SERVE_BASE: string } };

// Tracking URLs from /v1/ad (clickUrl, impressionPixel) are relative to the serving
// origin, but this snippet runs in the publisher's page. A relative URL would resolve
// against the publisher's domain (e.g. pizzadeig.is/v1/impression -> 404), so impressions
// are never counted and clicks break. Resolve relative URLs against SERVE_BASE — the same
// origin the ad was fetched from — so they reach the ad server.
function resolveServeUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.indexOf('data:') === 0) return url;
  const base = process.env.SERVE_BASE.replace(/\/$/, '');
  return url.charAt(0) === '/' ? base + url : base + '/' + url;
}

/**
 * Fire a tracking pixel (impression/pageview) with IAB-aligned viewability:
 * the pixel fires only when ≥50% of the element is visible for ≥1 continuous second.
 * Falls back to immediate fire if IntersectionObserver is unavailable.
 */
function firePixelWithViewability(el: HTMLElement, pixelUrl: string): void {
  const resolvedUrl = resolveServeUrl(pixelUrl);
  const fire = () => {
    const pixel = new Image(1, 1);
    pixel.src = resolvedUrl;
    pixel.style.position = 'absolute';
    pixel.style.left = '-9999px';
    el.appendChild(pixel);
  };

  // Pageviews (traffic tracking) are fired immediately without viewability/IntersectionObserver checks
  if (pixelUrl.includes('type=pageview')) {
    fire();
    return;
  }

  if (typeof IntersectionObserver !== 'undefined') {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // IAB standard: 50% visible for 1 continuous second
            timer = setTimeout(() => {
              fire();
              observer.disconnect();
            }, 1000);
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
  } else {
    // Fallback: fire immediately if IntersectionObserver is not supported
    fire();
  }
}

export function renderAd(el: HTMLElement, ad: AdResponse): void {
  // Always fire the tracking pixel first — even for empty/fallback responses.
  // Before this fix, empty responses ({empty:true}) never fired a pixel, making
  // uncached-slot visits completely invisible to publisher stats.
  if (ad.impressionPixel) {
    firePixelWithViewability(el, ad.impressionPixel);
  }

  if (ad.empty || !ad.creativeId || !ad.imageUrl || !ad.clickUrl) {
    el.style.display = 'none';
    return;
  }

  if (ad.creativeId === 'cre_fallback_transparent') {
    // Render fallback transparent element invisibly (telemetry only)
    const img = document.createElement('img');
    img.src = ad.imageUrl;
    img.width = 1;
    img.height = 1;
    img.style.position = 'absolute';
    img.style.opacity = '0';
    img.style.pointerEvents = 'none';
    el.appendChild(img);
    el.style.display = 'none';
  } else {
    const a = document.createElement('a');
    a.href = resolveServeUrl(ad.clickUrl);
    a.target = '_blank';
    a.rel = 'noopener noreferrer sponsored';
    a.style.display = 'inline-block';
    a.style.lineHeight = '0';

    const img = document.createElement('img');
    img.src = ad.imageUrl;
    if (ad.width) img.width = ad.width;
    if (ad.height) img.height = ad.height;
    img.alt = '';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.border = '0';

    a.appendChild(img);
    el.appendChild(a);

    if (ad.showBacklink) {
      const linkDiv = document.createElement('div');
      linkDiv.style.textAlign = 'right';
      linkDiv.style.marginTop = '3px';
      linkDiv.style.lineHeight = '1';

      const backlink = document.createElement('a');
      backlink.href = 'https://www.birtingur.app?utm_source=widget';
      backlink.target = '_blank';
      backlink.rel = 'noopener';
      backlink.textContent = 'Auglýsa hér ↗';
      backlink.style.fontSize = '9px';
      backlink.style.color = '#a1a1aa'; // zinc-400
      backlink.style.textDecoration = 'none';
      backlink.style.fontFamily = 'sans-serif';
      backlink.style.display = 'inline-block';
      backlink.style.opacity = '0.7';

      linkDiv.appendChild(backlink);
      el.appendChild(linkDiv);
    }
  }
}
