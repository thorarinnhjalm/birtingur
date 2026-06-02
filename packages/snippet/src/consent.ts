import type { ConsentState } from './types';

export function readConsent(): ConsentState {
  try {
    const v = (window as unknown as { __cmpConsent?: unknown }).__cmpConsent;
    if (v === true) return 'full';
    if (v === false) return 'none';
    if (v && typeof v === 'object' && 'advertising' in v) {
      return (v as { advertising: unknown }).advertising === true ? 'full' : 'none';
    }
    return 'none';
  } catch {
    return 'none';
  }
}
