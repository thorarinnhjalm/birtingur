/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getVisitorId } from '../src/visitor';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getVisitorId', () => {
  it('returns null and stores nothing when consent is none', () => {
    expect(getVisitorId('none')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('creates a 12-hex token and persists it when consent is full', () => {
    const id = getVisitorId('full');
    expect(id).toMatch(/^[a-f0-9]{12}$/);
    // Persisted so the same visitor is recognized on the next page load.
    expect(getVisitorId('full')).toBe(id);
  });

  it('reuses an already-stored valid token', () => {
    localStorage.setItem('_adp_vid', 'abc123456789');
    expect(getVisitorId('full')).toBe('abc123456789');
  });

  it('regenerates when the stored token is malformed', () => {
    localStorage.setItem('_adp_vid', 'garbage!!');
    const id = getVisitorId('full');
    expect(id).toMatch(/^[a-f0-9]{12}$/);
    expect(id).not.toBe('garbage!!');
  });

  it('returns null without throwing when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getVisitorId('full')).toBeNull();
  });
});
