import { describe, it, expect } from 'vitest';
import { PublisherSchema } from '../src/schemas/publisher';

const base = {
  id: 'pub_1',
  ownerEmail: 'a@b.is',
  domain: 'matarblogg.is',
  displayName: 'Matarblogg',
  contentPolicy: { blockedCategories: [], requireManualApproval: false },
  status: 'active',
  createdAt: new Date(),
  categories: ['matur'],
};

describe('PublisherSchema.categories', () => {
  it('accepts a valid category list', () => {
    expect(PublisherSchema.parse(base).categories).toEqual(['matur']);
  });
  it('rejects an empty category list', () => {
    expect(() => PublisherSchema.parse({ ...base, categories: [] })).toThrow();
  });
  it('rejects unknown categories', () => {
    expect(() => PublisherSchema.parse({ ...base, categories: ['nope'] })).toThrow();
  });
  it('requires categories explicitly (no silent default)', () => {
    const without = { ...base } as any;
    delete without.categories;
    expect(() => PublisherSchema.parse(without)).toThrow();
  });
});
