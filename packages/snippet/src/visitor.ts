import type { ConsentState } from './types';

const STORAGE_KEY = '_adp_vid';
const TOKEN_RE = /^[a-f0-9]{12}$/;

function generateToken(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Returns a stable, first-party visitor id used for cross-pageview frequency capping.
 *
 * The id lives in localStorage on the publisher's own origin — the only client storage
 * that survives in modern browsers (third-party cookies are blocked cross-origin). It is
 * only created/returned with full consent, since a persistent identifier requires consent;
 * without consent we return null and no frequency capping is applied. Capping is therefore
 * per-publisher-origin, which is the privacy-respecting model for a long-tail ad network.
 */
export function getVisitorId(consent: ConsentState): string | null {
  if (consent !== 'full') return null;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && TOKEN_RE.test(existing)) return existing;
    const token = generateToken();
    localStorage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    // Private mode / storage blocked: degrade gracefully without capping.
    return null;
  }
}
