import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  MIN_PAYOUT_ISK,
  MAX_CREATIVE_SIZE_BYTES,
  IAB_STANDARD_SIZES,
  GEO_REGIONS,
  FREQUENCY_CAP_DEFAULT_PER_DAY,
  CACHE_TTL_SECONDS,
  AD_REQUEST_TIMEOUT_MS,
} from '../src/constants';

describe('constants', () => {
  it('has correct default platform fee (20%)', () => {
    expect(DEFAULT_PLATFORM_FEE_PERCENT).toBe(20);
  });

  it('has minimum payout of 5000 ISK', () => {
    expect(MIN_PAYOUT_ISK).toBe(5000);
  });

  it('caps creative uploads at 2 MB', () => {
    expect(MAX_CREATIVE_SIZE_BYTES).toBe(2 * 1024 * 1024);
  });

  it('includes IAB standard sizes', () => {
    expect(IAB_STANDARD_SIZES).toContainEqual({ width: 728, height: 90, name: 'Leaderboard' });
    expect(IAB_STANDARD_SIZES).toContainEqual({ width: 300, height: 250, name: 'Medium Rectangle' });
    expect(IAB_STANDARD_SIZES).toContainEqual({ width: 300, height: 600, name: 'Half Page' });
    expect(IAB_STANDARD_SIZES).toContainEqual({ width: 320, height: 100, name: 'Mobile Banner' });
    expect(IAB_STANDARD_SIZES).toContainEqual({ width: 980, height: 120, name: 'Billboard IS' });
  });

  it('defines geo regions for Iceland', () => {
    expect(GEO_REGIONS).toEqual(['all', 'capital', 'countryside']);
  });

  it('default frequency cap is 3 per day', () => {
    expect(FREQUENCY_CAP_DEFAULT_PER_DAY).toBe(3);
  });

  it('cache TTL is 60 seconds', () => {
    expect(CACHE_TTL_SECONDS).toBe(60);
  });

  it('ad request timeout is 2000 ms', () => {
    expect(AD_REQUEST_TIMEOUT_MS).toBe(2000);
  });
});
