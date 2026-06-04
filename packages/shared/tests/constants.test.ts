import { describe, it, expect } from 'vitest';
import { AD_CATEGORIES, AD_CATEGORY_SLUGS } from '../src/constants';

describe('AD_CATEGORIES', () => {
  it('exposes food category for the canonical mayo use-case', () => {
    expect(AD_CATEGORY_SLUGS).toContain('matur');
  });
  it('every category has a slug and an Icelandic label', () => {
    for (const c of AD_CATEGORIES) {
      expect(c.slug).toMatch(/^[a-z_]+$/);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
  it('slugs are unique', () => {
    expect(new Set(AD_CATEGORY_SLUGS).size).toBe(AD_CATEGORY_SLUGS.length);
  });
});
