import { describe, it, expect } from 'vitest';
import {
  GeneratedCopyVariantSchema,
  GeneratedPreviewManifestSchema,
} from '../src/schemas/generated-preview';

describe('GeneratedCopyVariantSchema', () => {
  it('accepts and preserves normal, non-whitespace copy', () => {
    const result = GeneratedCopyVariantSchema.parse({
      headline: 'Sumarútsala',
      subline: 'Allt að 40% afsláttur',
      cta: 'Sjá nánar',
    });
    expect(result).toEqual({
      headline: 'Sumarútsala',
      subline: 'Allt að 40% afsláttur',
      cta: 'Sjá nánar',
    });
  });

  it('trims leading/trailing whitespace before persisting', () => {
    const result = GeneratedCopyVariantSchema.parse({
      headline: '  Sumarútsala  ',
      subline: '  Allt að 40% afsláttur  ',
      cta: '  Sjá nánar  ',
    });
    expect(result).toEqual({
      headline: 'Sumarútsala',
      subline: 'Allt að 40% afsláttur',
      cta: 'Sjá nánar',
    });
  });

  // Fix 11 (adversarial review): `.trim()` runs BEFORE `.min(1)` so
  // whitespace-only copy — e.g. an advertiser's editedCopy that's just
  // spaces — fails validation instead of silently persisting as "valid"
  // blank text that only breaks visibly once rendered onto a banner.
  it('rejects a whitespace-only headline (min(1) applies to the TRIMMED value)', () => {
    expect(() =>
      GeneratedCopyVariantSchema.parse({ headline: '   ', subline: 'ok', cta: 'ok' }),
    ).toThrow();
  });

  it('rejects a whitespace-only subline', () => {
    expect(() =>
      GeneratedCopyVariantSchema.parse({ headline: 'ok', subline: '\t\n  ', cta: 'ok' }),
    ).toThrow();
  });

  it('rejects a whitespace-only cta', () => {
    expect(() =>
      GeneratedCopyVariantSchema.parse({ headline: 'ok', subline: 'ok', cta: '    ' }),
    ).toThrow();
  });

  it('still enforces max length against the TRIMMED value, not the raw input', () => {
    // 30 real characters, padded with whitespace that trim() strips first —
    // must still pass (trimmed length is exactly at the cap, not over it).
    const headline = 'x'.repeat(30);
    const result = GeneratedCopyVariantSchema.parse({
      headline: `  ${headline}  `,
      subline: 'ok',
      cta: 'ok',
    });
    expect(result.headline).toBe(headline);
  });
});

describe('GeneratedPreviewManifestSchema — self-healing tolerance (Fix 6)', () => {
  const baseVariant = {
    variantId: 'gen_1',
    copy: { headline: 'Sumarútsala', subline: 'Allt að 40% afsláttur', cta: 'Sjá nánar' },
    images: [
      { sizeKey: '300x250', width: 300, height: 250, url: 'https://storage.example.test/a.png' },
    ],
  };

  it('parses a full manifest with `extract` and `status` unchanged (baseline)', () => {
    const result = GeneratedPreviewManifestSchema.parse({
      id: 'adv_1',
      advertiserId: 'adv_1',
      landingUrl: 'https://blomabud.is/',
      extract: { title: 'Blómabúð', description: 'desc', siteName: 'Blómabúð' },
      createdAt: new Date(),
      status: 'copy',
      variants: [baseVariant],
    });
    expect(result.status).toBe('copy');
    expect(result.extract).toEqual({
      title: 'Blómabúð',
      description: 'desc',
      siteName: 'Blómabúð',
    });
  });

  it('parses a manifest missing `extract` entirely (pre-wizard one-shot shape)', () => {
    const result = GeneratedPreviewManifestSchema.parse({
      id: 'adv_1',
      advertiserId: 'adv_1',
      landingUrl: 'https://blomabud.is/',
      createdAt: new Date(),
      status: 'rendered',
      variants: [baseVariant],
    });
    expect(result.extract).toBeUndefined();
  });

  it('defaults `status` to "rendered" when the field is missing entirely', () => {
    const result = GeneratedPreviewManifestSchema.parse({
      id: 'adv_1',
      advertiserId: 'adv_1',
      landingUrl: 'https://blomabud.is/',
      createdAt: new Date(),
      variants: [baseVariant],
    });
    expect(result.status).toBe('rendered');
  });

  it('parses a manifest missing BOTH `extract` and `status` (the exact old one-shot shape)', () => {
    const result = GeneratedPreviewManifestSchema.parse({
      id: 'adv_1',
      advertiserId: 'adv_1',
      landingUrl: 'https://blomabud.is/',
      createdAt: new Date(),
      variants: [baseVariant],
    });
    expect(result.status).toBe('rendered');
    expect(result.extract).toBeUndefined();
    expect(result.variants[0]!.images).toHaveLength(1);
  });
});
