import type { AdResponse } from './types';

export function renderAd(el: HTMLElement, ad: AdResponse): void {
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
  } else {
    const a = document.createElement('a');
    a.href = ad.clickUrl;
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
  }

  if (ad.impressionPixel) {
    const pixel = new Image(1, 1);
    pixel.src = ad.impressionPixel;
    pixel.style.position = 'absolute';
    pixel.style.left = '-9999px';
    el.appendChild(pixel);
  }
}
