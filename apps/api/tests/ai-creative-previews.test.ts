import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratedPreviewManifestSchema } from '@ada/shared';
import type { GeneratedPreviewManifest } from '@ada/shared';
import { COLLECTIONS } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';
import { db } from '../src/lib/firebase';
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
      extract: {
        title: 'Blómabúð Vesturbæjar',
        description: 'Ferskir blómvendir sendir samdægurs.',
        siteName: 'Blómabúð Vesturbæjar',
      },
      createdAt,
      status: 'rendered',
      variants: [
        {
          variantId: 'gen_roundtrip1',
          copy: { headline: 'Sumarútsala', subline: 'Allt að 40% afsláttur', cta: 'Sjá nánar' },
          templateId: 'bold',
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

  // Fix 6 (adversarial review): the previously-deployed one-shot
  // `/v1/creatives/generate` route (`generate.ts`, since deleted) never
  // persisted `extract` or `status` at all — a manifest it wrote could
  // still be sitting in Firestore right after this PR deploys. Writing the
  // doc directly (bypassing `savePreviewManifest`/the schema entirely, the
  // way the OLD route actually would have) proves `getPreviewManifest`
  // tolerates that shape instead of 500ing until the advertiser's next
  // `/generate/copy` call overwrites it.
  it('self-healing tolerance: parses a pre-wizard manifest that has neither `extract` nor `status`, defaulting status to "rendered"', async () => {
    await db
      .collection(COLLECTIONS.generatedPreviews)
      .doc('adv_preexisting_oneshot')
      .set({
        advertiserId: 'adv_preexisting_oneshot',
        landingUrl: 'https://blomabud.is/',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        variants: [
          {
            variantId: 'gen_oneshot1',
            copy: { headline: 'Sumarútsala', subline: 'Allt að 40% afsláttur', cta: 'Sjá nánar' },
            images: [
              {
                sizeKey: '300x250',
                width: 300,
                height: 250,
                url: 'https://storage.example.test/creatives/adv_preexisting_oneshot/gen_oneshot1-300x250.png',
              },
            ],
          },
        ],
        // Deliberately NO `extract`, NO `status` — the old one-shot shape.
      });

    const loaded = await getPreviewManifest('adv_preexisting_oneshot');

    expect(loaded).not.toBeNull();
    expect(loaded!.status).toBe('rendered');
    expect(loaded!.extract).toBeUndefined();
    expect(loaded!.variants[0]!.images).toHaveLength(1);
  });

  // Split generation flow (creative-wizard, 2026-07-27 plan): right after
  // /generate/copy, a manifest's variants have copy but NO rendered images
  // yet — `images: []` and `status: 'copy'` must round-trip cleanly, not
  // just the fully-rendered shape asserted above.
  it('round-trips a status:"copy" manifest with empty per-variant images', async () => {
    const manifest: GeneratedPreviewManifest = GeneratedPreviewManifestSchema.parse({
      id: 'adv_preview_copy_only',
      advertiserId: 'adv_preview_copy_only',
      landingUrl: 'https://blomabud.is/',
      extract: {
        title: 'Blómabúð Vesturbæjar',
        description: 'Ferskir blómvendir sendir samdægurs.',
        siteName: 'Blómabúð Vesturbæjar',
      },
      createdAt: new Date('2026-07-27T09:00:00.000Z'),
      status: 'copy',
      variants: [
        {
          variantId: 'gen_copyonly1',
          copy: { headline: 'Sumarútsala', subline: 'Allt að 40% afsláttur', cta: 'Sjá nánar' },
          images: [],
        },
      ],
    });

    await savePreviewManifest(manifest);
    const loaded = await getPreviewManifest('adv_preview_copy_only');

    expect(loaded).not.toBeNull();
    expect(loaded!.status).toBe('copy');
    expect(loaded!.variants[0]!.images).toEqual([]);
    expect(loaded!.variants[0]!.templateId).toBeUndefined();
  });
});
