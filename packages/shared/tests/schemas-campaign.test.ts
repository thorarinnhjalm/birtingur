import { describe, it, expect } from 'vitest';
import {
  CampaignSchema,
  TargetingSchema,
  BudgetSchema,
  ScheduleSchema,
} from '../src/schemas/campaign';

describe('ScheduleSchema', () => {
  it('accepts valid schedule (end after start)', () => {
    const valid = {
      startsAt: new Date('2026-06-02T00:00:00Z'),
      endsAt: new Date('2026-06-30T23:59:59Z'),
    };
    expect(() => ScheduleSchema.parse(valid)).not.toThrow();
  });

  it('rejects end before start', () => {
    expect(() =>
      ScheduleSchema.parse({
        startsAt: new Date('2026-06-30T00:00:00Z'),
        endsAt: new Date('2026-06-02T00:00:00Z'),
      }),
    ).toThrow();
  });
});

describe('TargetingSchema', () => {
  it('accepts targeting with only slots', () => {
    expect(() => TargetingSchema.parse({ slotIds: ['slot_a', 'slot_b'] })).not.toThrow();
  });

  it('accepts targeting with geo', () => {
    expect(() =>
      TargetingSchema.parse({
        slotIds: ['slot_a'],
        geoCountries: ['IS'],
        geoRegions: ['capital'],
      }),
    ).not.toThrow();
  });

  it('requires at least one slot', () => {
    expect(() => TargetingSchema.parse({ slotIds: [] })).toThrow();
  });

  it('rejects invalid geoRegions', () => {
    expect(() =>
      TargetingSchema.parse({
        slotIds: ['slot_a'],
        geoRegions: ['mars'],
      }),
    ).toThrow();
  });
});

describe('BudgetSchema', () => {
  it('accepts cpm_capped budget', () => {
    const v = { mode: 'cpm_capped' as const, totalIsk: 20000, remainingIsk: 5000 };
    expect(() => BudgetSchema.parse(v)).not.toThrow();
  });

  it('accepts slot_purchased budget', () => {
    const v = { mode: 'slot_purchased' as const, totalIsk: 25000, remainingIsk: 25000 };
    expect(() => BudgetSchema.parse(v)).not.toThrow();
  });

  it('rejects remaining > total', () => {
    expect(() =>
      BudgetSchema.parse({ mode: 'cpm_capped', totalIsk: 1000, remainingIsk: 2000 }),
    ).toThrow();
  });
});

describe('CampaignSchema', () => {
  it('accepts valid campaign', () => {
    const valid = {
      id: 'cmp_xyz',
      advertiserId: 'adv_xyz',
      creativeIds: ['cre_a'],
      targeting: {
        slotIds: ['slot_a', 'slot_b'],
        geoCountries: ['IS'] as const,
      },
      schedule: {
        startsAt: new Date('2026-06-02T00:00:00Z'),
        endsAt: new Date('2026-06-30T00:00:00Z'),
      },
      budget: { mode: 'cpm_capped' as const, totalIsk: 20000, remainingIsk: 20000 },
      status: 'active' as const,
      perPublisherApproval: { pub_a: 'approved' as const, pub_b: 'pending' as const },
    };
    expect(() => CampaignSchema.parse(valid)).not.toThrow();
  });

  it('requires at least one creative', () => {
    expect(() =>
      CampaignSchema.parse({
        id: 'cmp_xyz',
        advertiserId: 'adv_xyz',
        creativeIds: [],
        targeting: { slotIds: ['slot_a'] },
        schedule: {
          startsAt: new Date('2026-06-02T00:00:00Z'),
          endsAt: new Date('2026-06-30T00:00:00Z'),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20000, remainingIsk: 20000 },
        status: 'draft',
        perPublisherApproval: {},
      }),
    ).toThrow();
  });
});
