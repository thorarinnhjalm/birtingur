import { describe, it, expect } from 'vitest';
import * as visitorModule from '../src/lib/visitor';
import { hashVisitorToken, getVisitorToken } from '../src/lib/visitor';

describe('hashVisitorToken', () => {
  it('produces stable hash for same input', () => {
    expect(hashVisitorToken('abc')).toBe(hashVisitorToken('abc'));
  });

  it('produces different hash for different input', () => {
    expect(hashVisitorToken('abc')).not.toBe(hashVisitorToken('def'));
  });

  it('is 12 chars hex', () => {
    expect(hashVisitorToken('abc')).toMatch(/^[a-f0-9]{12}$/);
  });
});

describe('getVisitorToken', () => {
  // The snippet only produces a visitor id under full consent (packages/snippet
  // getVisitorId), so a present ?vid= already implies consent was given.
  it('returns the consented first-party token supplied by the snippet', () => {
    expect(getVisitorToken('def456789abc')).toBe('def456789abc');
  });

  it('returns an empty token when the snippet supplied none', () => {
    expect(getVisitorToken(undefined)).toBe('');
  });

  it('returns an empty token when the supplied token is malformed', () => {
    expect(getVisitorToken('not-a-valid-token!')).toBe('');
  });

  // Without consent there is no identifier at all — we must not invent a
  // server-side one, because a generated id would be a tracking identifier by
  // another name and would also write a Redis frequency-cap key per request
  // that nothing ever reads again.
  it('does not invent a random identifier when consent is absent', () => {
    expect(getVisitorToken(undefined)).toBe(getVisitorToken(undefined));
  });
});

describe('cookie-free serving', () => {
  it('exposes no cookie helper at all', () => {
    expect(Object.keys(visitorModule)).not.toContain('setCookieHeader');
  });
});
