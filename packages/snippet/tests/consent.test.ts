/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { readConsent } from '../src/consent';

beforeEach(() => {
  delete (window as unknown as { __cmpConsent?: unknown }).__cmpConsent;
});

describe('readConsent', () => {
  it('returns "none" when no CMP global is set', () => {
    expect(readConsent()).toBe('none');
  });

  it('reads boolean true as full', () => {
    (window as unknown as { __cmpConsent: boolean }).__cmpConsent = true;
    expect(readConsent()).toBe('full');
  });

  it('reads boolean false as none', () => {
    (window as unknown as { __cmpConsent: boolean }).__cmpConsent = false;
    expect(readConsent()).toBe('none');
  });

  it('reads object with consent.advertising === true as full', () => {
    (window as unknown as { __cmpConsent: object }).__cmpConsent = {
      advertising: true,
    };
    expect(readConsent()).toBe('full');
  });

  it('reads object with advertising === false as none', () => {
    (window as unknown as { __cmpConsent: object }).__cmpConsent = {
      advertising: false,
    };
    expect(readConsent()).toBe('none');
  });

  it('returns "none" on unrecognized shape', () => {
    (window as unknown as { __cmpConsent: unknown }).__cmpConsent = 'maybe';
    expect(readConsent()).toBe('none');
  });
});
