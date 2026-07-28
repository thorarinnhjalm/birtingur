import { describe, it, expect } from 'vitest';
import { deriveIdempotencyKey, extractApiKeyId } from '../src/tools/advertiser/create-campaign.js';

// Fix 4 (adversarial review): the auto-derived idempotency key must fold in
// EVERY purchase-relevant input (not just categories/total_isk/creative_ids/
// schedule) plus the calling API key's id, or two genuinely different
// purchases (different name, different geo targeting, or made by a different
// key) could collapse into "the same request" and only one would ever be
// created. See apps/api/src/services/campaigns.ts createCampaign for the
// matching server-side scoping of the idempotency lookup by apiKeyId.

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    categories: ['matur'],
    total_isk: 50_000,
    creative_ids: ['cre_a', 'cre_b'],
    starts_at: '2026-08-01T00:00:00Z',
    ends_at: '2026-08-31T00:00:00Z',
    ...overrides,
  } as Parameters<typeof deriveIdempotencyKey>[0];
}

describe('deriveIdempotencyKey', () => {
  it('is deterministic: the same logical request derives the same key twice', () => {
    const a = deriveIdempotencyKey(baseInput({ name: 'Sumarherferð' }), 'ak_aaaaaaaaaaaaaaaa');
    const b = deriveIdempotencyKey(baseInput({ name: 'Sumarherferð' }), 'ak_aaaaaaaaaaaaaaaa');
    expect(a).toBe(b);
  });

  it('differs when `name` differs', () => {
    const a = deriveIdempotencyKey(baseInput({ name: 'Sumarherferð' }), 'ak_aaaaaaaaaaaaaaaa');
    const b = deriveIdempotencyKey(baseInput({ name: 'Vetrarherferð' }), 'ak_aaaaaaaaaaaaaaaa');
    expect(a).not.toBe(b);
  });

  it('differs when `geo_regions` differ', () => {
    const a = deriveIdempotencyKey(
      baseInput({ geo_regions: ['reykjavik'] }),
      'ak_aaaaaaaaaaaaaaaa',
    );
    const b = deriveIdempotencyKey(baseInput({ geo_regions: ['akureyri'] }), 'ak_aaaaaaaaaaaaaaaa');
    expect(a).not.toBe(b);
  });

  it('normalizes `geo_regions` order — same set, different order, same key', () => {
    const a = deriveIdempotencyKey(
      baseInput({ geo_regions: ['reykjavik', 'akureyri'] }),
      'ak_aaaaaaaaaaaaaaaa',
    );
    const b = deriveIdempotencyKey(
      baseInput({ geo_regions: ['akureyri', 'reykjavik'] }),
      'ak_aaaaaaaaaaaaaaaa',
    );
    expect(a).toBe(b);
  });

  it('differs when the calling API key id differs — two keys never collide on the same derived key', () => {
    const a = deriveIdempotencyKey(baseInput(), 'ak_aaaaaaaaaaaaaaaa');
    const b = deriveIdempotencyKey(baseInput(), 'ak_bbbbbbbbbbbbbbbb');
    expect(a).not.toBe(b);
  });

  it('differs on ordinary purchase-relevant fields too (budget, creatives, schedule)', () => {
    const a = deriveIdempotencyKey(baseInput(), 'ak_aaaaaaaaaaaaaaaa');
    const b = deriveIdempotencyKey(baseInput({ total_isk: 60_000 }), 'ak_aaaaaaaaaaaaaaaa');
    const c = deriveIdempotencyKey(baseInput({ creative_ids: ['cre_c'] }), 'ak_aaaaaaaaaaaaaaaa');
    const d = deriveIdempotencyKey(
      baseInput({ ends_at: '2026-09-30T00:00:00Z' }),
      'ak_aaaaaaaaaaaaaaaa',
    );
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it('treats an absent name/geo_regions consistently (no name vs explicit undefined)', () => {
    const a = deriveIdempotencyKey(baseInput(), 'ak_aaaaaaaaaaaaaaaa');
    const b = deriveIdempotencyKey(baseInput({ name: undefined }), 'ak_aaaaaaaaaaaaaaaa');
    expect(a).toBe(b);
  });
});

describe('extractApiKeyId', () => {
  it('extracts the id portion (ak_ + 16 hex chars) from a full key', () => {
    const fullKey = `ak_${'a'.repeat(16)}_${'b'.repeat(48)}`;
    expect(extractApiKeyId(fullKey)).toBe(`ak_${'a'.repeat(16)}`);
  });

  it('falls back to the whole string when the format does not match', () => {
    expect(extractApiKeyId('not-a-real-key')).toBe('not-a-real-key');
  });
});
