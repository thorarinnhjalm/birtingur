import { describe, it, expect } from 'vitest';
import { LedgerEntrySchema, PayoutSchema } from '../src/schemas/ledger';

describe('LedgerEntrySchema', () => {
  it('accepts a topup entry', () => {
    const v = {
      id: 'led_a',
      party: { type: 'advertiser' as const, id: 'adv_x' },
      type: 'topup' as const,
      amountIsk: 20000,
      relatedId: 'teya_txn_123',
      createdAt: new Date(),
    };
    expect(() => LedgerEntrySchema.parse(v)).not.toThrow();
  });

  it('accepts negative charge entry', () => {
    const v = {
      id: 'led_b',
      party: { type: 'advertiser' as const, id: 'adv_x' },
      type: 'campaign_charge' as const,
      amountIsk: -5000,
      relatedId: 'cmp_xyz',
      createdAt: new Date(),
    };
    expect(() => LedgerEntrySchema.parse(v)).not.toThrow();
  });

  it('accepts platform fee entry', () => {
    const v = {
      id: 'led_c',
      party: { type: 'platform' as const, id: 'platform' },
      type: 'platform_fee' as const,
      amountIsk: 1000,
      relatedId: 'cmp_xyz',
      createdAt: new Date(),
    };
    expect(() => LedgerEntrySchema.parse(v)).not.toThrow();
  });

  it('rejects amount of zero', () => {
    expect(() =>
      LedgerEntrySchema.parse({
        id: 'led_d',
        party: { type: 'advertiser', id: 'adv_x' },
        type: 'topup',
        amountIsk: 0,
        relatedId: 'x',
        createdAt: new Date(),
      }),
    ).toThrow();
  });

  it('rejects topup with negative amount', () => {
    expect(() =>
      LedgerEntrySchema.parse({
        id: 'led_e',
        party: { type: 'advertiser', id: 'adv_x' },
        type: 'topup',
        amountIsk: -100,
        relatedId: 'x',
        createdAt: new Date(),
      }),
    ).toThrow();
  });
});

describe('PayoutSchema', () => {
  it('accepts a complete payout', () => {
    const v = {
      id: 'pay_a',
      publisherId: 'pub_x',
      periodStart: new Date('2026-05-01T00:00:00Z'),
      periodEnd: new Date('2026-05-31T23:59:59Z'),
      grossIsk: 18250,
      platformFeeIsk: 3650,
      netIsk: 14600,
      status: 'pending' as const,
      bankReference: '',
    };
    expect(() => PayoutSchema.parse(v)).not.toThrow();
  });

  it('requires gross = fee + net', () => {
    expect(() =>
      PayoutSchema.parse({
        id: 'pay_b',
        publisherId: 'pub_x',
        periodStart: new Date('2026-05-01T00:00:00Z'),
        periodEnd: new Date('2026-05-31T23:59:59Z'),
        grossIsk: 18250,
        platformFeeIsk: 3650,
        netIsk: 10000,
        status: 'pending',
        bankReference: '',
      }),
    ).toThrow();
  });

  it('requires periodEnd > periodStart', () => {
    expect(() =>
      PayoutSchema.parse({
        id: 'pay_c',
        publisherId: 'pub_x',
        periodStart: new Date('2026-05-31T00:00:00Z'),
        periodEnd: new Date('2026-05-01T00:00:00Z'),
        grossIsk: 100,
        platformFeeIsk: 20,
        netIsk: 80,
        status: 'pending',
        bankReference: '',
      }),
    ).toThrow();
  });
});
