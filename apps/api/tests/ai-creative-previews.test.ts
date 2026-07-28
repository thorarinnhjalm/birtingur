import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratedPreviewManifestSchema } from '@ada/shared';
import type { GeneratedPreviewManifest } from '@ada/shared';
import { clearFirestoreEmulator } from './helpers/emulator';
import { savePreviewManifest, getPreviewManifest } from '../src/services/ai-creative/previews';

// Fix 6 (adversarial review): tests/ai-creative-generate-route.test.ts mocks
// `db` entirely, including a hand-rolled `withConverter` stub that just
// passes plain JS objects straight through — it never exercises the REAL
// `generatedPreviewManifestConverter` (packages/shared/src/firestore/
// converters.ts), which is what actually does the Timestamp<->Date dance for
// `createdAt` against a real Firestore instance. This test runs against the
// real emulator (like reconciliation.test.ts / agent-purchase.test.ts) so a
// converter regression (e.g. createdAt surviving as a Firestore Timestamp
// instead of being converted back to a `Date`) would actually be caught.
describe('generated_previews manifest — real converter round-trip', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('round-trips createdAt (Timestamp <-> Date) and the full variant/image shape through Firestore', async () => {
    const createdAt = new Date('2026-07-15T12:34:56.000Z');
    const manifest: GeneratedPreviewManifest = GeneratedPreviewManifestSchema.parse({
      id: 'adv_preview_roundtrip',
      advertiserId: 'adv_preview_roundtrip',
      landingUrl: 'https://blomabud.is/',
      createdAt,
      variants: [
        {
          variantId: 'gen_roundtrip1',
          copy: { headline: 'Sumarútsala', subline: 'Allt að 40% afsláttur', cta: 'Sjá nánar' },
          images: [
            {
              sizeKey: '300x250',
              width: 300,
              height: 250,
              url: 'https://storage.example.test/creatives/adv_preview_roundtrip/gen_roundtrip1-300x250.png',
            },
          ],
        },
      ],
    });

    await savePreviewManifest(manifest);
    const loaded = await getPreviewManifest('adv_preview_roundtrip');

    expect(loaded).not.toBeNull();
    // The real converter must hand back a genuine Date instance, not a
    // Firestore Timestamp object and not an ISO string.
    expect(loaded!.createdAt).toBeInstanceOf(Date);
    expect(loaded!.createdAt.getTime()).toBe(createdAt.getTime());
    expect(loaded!.advertiserId).toBe('adv_preview_roundtrip');
    expect(loaded!.landingUrl).toBe('https://blomabud.is/');
    expect(loaded!.variants).toHaveLength(1);
    expect(loaded!.variants[0]!.variantId).toBe('gen_roundtrip1');
    expect(loaded!.variants[0]!.copy.headline).toBe('Sumarútsala');
    expect(loaded!.variants[0]!.images[0]!.url).toBe(
      'https://storage.example.test/creatives/adv_preview_roundtrip/gen_roundtrip1-300x250.png',
    );
  });

  it('returns null for an advertiser with no saved manifest', async () => {
    const loaded = await getPreviewManifest('adv_never_generated');
    expect(loaded).toBeNull();
  });
});
