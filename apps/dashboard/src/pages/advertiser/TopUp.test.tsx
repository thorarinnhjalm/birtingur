import { describe, it, expect } from 'vitest';
import { initialTopUpAmount } from './TopUp';

// Pins the prefill contract CampaignCreate relies on when it links to
// /advertiser/topup?amount=<shortfall> — adversarial review of the PR that
// added it found the parsing/rounding/clamping entirely untested (only the
// URL CampaignCreate emits was pinned; deleting the initializer changed no
// test result).
describe('initialTopUpAmount', () => {
  it('rounds a shortfall up to a whole thousand', () => {
    expect(initialTopUpAmount('5000')).toBe(5000);
    expect(initialTopUpAmount('5001')).toBe(6000);
    expect(initialTopUpAmount('12345')).toBe(13000);
  });

  it('clamps up to the 2.000 kr. payment minimum', () => {
    expect(initialTopUpAmount('1')).toBe(2000);
    expect(initialTopUpAmount('1999')).toBe(2000);
  });

  it('clamps absurd values down to the 10 m.kr. ceiling', () => {
    expect(initialTopUpAmount('1e15')).toBe(10_000_000);
  });

  it('falls back to the 20.000 kr. default on garbage, absence, and non-positives', () => {
    expect(initialTopUpAmount(null)).toBe(20000);
    expect(initialTopUpAmount('')).toBe(20000);
    expect(initialTopUpAmount('abc')).toBe(20000);
    expect(initialTopUpAmount('0')).toBe(20000);
    expect(initialTopUpAmount('-5000')).toBe(20000);
    expect(initialTopUpAmount('Infinity')).toBe(20000);
  });
});
