import { fetchAd } from './api';
import { renderAd } from './render';
import { readConsent } from './consent';

function init(): void {
  const slots = document.querySelectorAll<HTMLElement>('[data-adplatform-slot]');
  const consent = readConsent();
  slots.forEach((el) => {
    const slotId = el.getAttribute('data-adplatform-slot');
    if (!slotId) {
      el.style.display = 'none';
      return;
    }
    fetchAd(slotId, consent).then((ad) => {
      if (!ad) {
        el.style.display = 'none';
        return;
      }
      try {
        renderAd(el, ad);
      } catch {
        el.style.display = 'none';
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
