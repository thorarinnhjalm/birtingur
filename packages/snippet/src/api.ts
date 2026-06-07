import type { AdResponse, ConsentState } from './types';

declare const process: { env: { SERVE_BASE: string } };

const TIMEOUT_MS = 2000;

export async function fetchAd(
  slotId: string,
  consent: ConsentState,
  visitorId?: string | null,
): Promise<AdResponse | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const vidParam = visitorId ? `&vid=${encodeURIComponent(visitorId)}` : '';
    const url = `${process.env.SERVE_BASE}/v1/ad?slot=${encodeURIComponent(slotId)}&consent=${consent}${vidParam}&v=1`;
    const res = await fetch(url, { credentials: 'omit', signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as AdResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
