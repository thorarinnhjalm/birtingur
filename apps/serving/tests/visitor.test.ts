import { describe, it, expect } from 'vitest';
import { hashVisitorToken, getOrCreateVisitorToken } from '../src/lib/visitor';

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

describe('getOrCreateVisitorToken', () => {
  it('returns existing cookie if set', () => {
    expect(getOrCreateVisitorToken('_adp_v=abc123456789')).toBe('abc123456789');
  });

  it('generates new token if absent', () => {
    const t = getOrCreateVisitorToken(undefined);
    expect(t).toMatch(/^[a-f0-9]{12}$/); // randomBytes(6) to hex is 12 characters
  });
});
