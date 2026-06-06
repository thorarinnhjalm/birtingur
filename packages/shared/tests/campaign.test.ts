import { describe, it, expect } from 'vitest';
import { TargetingSchema, CampaignSchema } from '../src/schemas/campaign';

describe('TargetingSchema', () => {
  it('requires at least one category', () => {
    expect(TargetingSchema.parse({ categories: ['matur'] }).categories).toEqual(['matur']);
    expect(() => TargetingSchema.parse({ categories: [] })).toThrow();
  });
  it('no longer accepts slotIds as the targeting key', () => {
    const parsed = TargetingSchema.parse({ categories: ['matur'], slotIds: ['x'] } as any);
    expect((parsed as any).slotIds).toBeUndefined();
  });
  it('requires targeting.categories explicitly (no silent default)', () => {
    expect(() => TargetingSchema.parse({})).toThrow();
  });
  it('accepts optional geoRegions on targeting', () => {
    const t = TargetingSchema.parse({ categories: ['matur'], geoRegions: ['capital'] });
    expect(t.geoRegions).toEqual(['capital']);
    // still valid without geoRegions
    expect(TargetingSchema.parse({ categories: ['matur'] }).geoRegions).toBeUndefined();
  });
  it('rejects an invalid region', () => {
    expect(() => TargetingSchema.parse({ categories: ['matur'], geoRegions: ['mars'] })).toThrow();
  });
});

describe('CampaignSchema', () => {
  it('has no perPublisherApproval field', () => {
    const c = CampaignSchema.parse({
      id: 'cmp_1',
      advertiserId: 'adv_1',
      creativeIds: ['cre_1'],
      targeting: { categories: ['matur'] },
      schedule: { startsAt: new Date(), endsAt: new Date(Date.now() + 1000) },
      budget: { mode: 'cpm_capped', totalIsk: 50000, remainingIsk: 50000 },
      status: 'active',
    });
    expect((c as any).perPublisherApproval).toBeUndefined();
  });
});
