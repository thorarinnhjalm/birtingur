import { describe, it, expect } from 'vitest';
import {
  PublisherSchema,
  SlotSchema,
  ContentPolicySchema,
  PayoutMethodSchema,
} from '../src/schemas/publisher';

describe('PayoutMethodSchema', () => {
  it('accepts valid bank payout', () => {
    const valid = {
      type: 'bank' as const,
      iban: 'IS140159260076545510730339',
      kennitala: '1234567890',
      accountName: 'Jón Jónsson',
    };
    expect(PayoutMethodSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid kennitala (must be 10 digits)', () => {
    expect(() =>
      PayoutMethodSchema.parse({
        type: 'bank',
        iban: 'IS140159260076545510730339',
        kennitala: '12345',
        accountName: 'Jón',
      }),
    ).toThrow();
  });

  it('rejects invalid IBAN', () => {
    expect(() =>
      PayoutMethodSchema.parse({
        type: 'bank',
        iban: 'invalid',
        kennitala: '1234567890',
        accountName: 'Jón',
      }),
    ).toThrow();
  });
});

describe('ContentPolicySchema', () => {
  it('defaults requireManualApproval to false', () => {
    const parsed = ContentPolicySchema.parse({ blockedCategories: [] });
    expect(parsed.requireManualApproval).toBe(false);
  });

  it('accepts blocked categories', () => {
    const parsed = ContentPolicySchema.parse({
      blockedCategories: ['gambling', 'alcohol'],
      requireManualApproval: true,
    });
    expect(parsed.blockedCategories).toEqual(['gambling', 'alcohol']);
    expect(parsed.requireManualApproval).toBe(true);
  });
});

describe('PublisherSchema', () => {
  it('accepts valid publisher', () => {
    const valid = {
      id: 'pub_abc123',
      ownerEmail: 'jon@example.is',
      domain: 'kjarninn.is',
      displayName: 'Kjarninn',
      payoutMethod: {
        type: 'bank' as const,
        iban: 'IS140159260076545510730339',
        kennitala: '1234567890',
        accountName: 'Kjarninn ehf.',
      },
      contentPolicy: {
        blockedCategories: ['gambling'],
        requireManualApproval: true,
      },
      status: 'active' as const,
      createdAt: new Date('2026-06-02T12:00:00Z'),
    };
    expect(() => PublisherSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid domain', () => {
    expect(() =>
      PublisherSchema.parse({
        id: 'pub_abc',
        ownerEmail: 'jon@example.is',
        domain: 'not a domain',
        displayName: 'X',
        payoutMethod: {
          type: 'bank',
          iban: 'IS140159260076545510730339',
          kennitala: '1234567890',
          accountName: 'X',
        },
        contentPolicy: { blockedCategories: [] },
        status: 'active',
        createdAt: new Date(),
      }),
    ).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() =>
      PublisherSchema.parse({
        id: 'pub_abc',
        ownerEmail: 'not-an-email',
        domain: 'kjarninn.is',
        displayName: 'X',
        payoutMethod: {
          type: 'bank',
          iban: 'IS140159260076545510730339',
          kennitala: '1234567890',
          accountName: 'X',
        },
        contentPolicy: { blockedCategories: [] },
        status: 'active',
        createdAt: new Date(),
      }),
    ).toThrow();
  });
});

describe('SlotSchema', () => {
  it('accepts CPM-priced slot', () => {
    const valid = {
      id: 'slot_xyz',
      publisherId: 'pub_abc',
      name: 'Forsíða leaderboard',
      sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm' as const, cpmIsk: 1500 },
      placement: {
        pageMatcher: '/',
        position: 'above_fold' as const,
      },
      status: 'active' as const,
    };
    expect(() => SlotSchema.parse(valid)).not.toThrow();
  });

  it('accepts slot-priced slot', () => {
    const valid = {
      id: 'slot_xyz',
      publisherId: 'pub_abc',
      name: 'Forsíða leaderboard',
      sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'slot' as const, slotPriceIsk: 25000, slotPeriodDays: 7 },
      placement: { pageMatcher: '/', position: 'above_fold' as const },
      status: 'active' as const,
    };
    expect(() => SlotSchema.parse(valid)).not.toThrow();
  });

  it('rejects CPM mode without cpmIsk', () => {
    expect(() =>
      SlotSchema.parse({
        id: 'slot_xyz',
        publisherId: 'pub_abc',
        name: 'X',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm' },
        placement: { pageMatcher: '/', position: 'above_fold' },
        status: 'active',
      }),
    ).toThrow();
  });

  it('rejects slot mode without slotPriceIsk and slotPeriodDays', () => {
    expect(() =>
      SlotSchema.parse({
        id: 'slot_xyz',
        publisherId: 'pub_abc',
        name: 'X',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'slot' },
        placement: { pageMatcher: '/', position: 'above_fold' },
        status: 'active',
      }),
    ).toThrow();
  });

  it('requires at least one size', () => {
    expect(() =>
      SlotSchema.parse({
        id: 'slot_xyz',
        publisherId: 'pub_abc',
        name: 'X',
        sizes: [],
        pricing: { mode: 'cpm', cpmIsk: 1000 },
        placement: { pageMatcher: '/', position: 'above_fold' },
        status: 'active',
      }),
    ).toThrow();
  });
});
