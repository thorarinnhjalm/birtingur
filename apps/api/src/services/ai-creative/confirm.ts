import type { Creative, GeneratedPreviewImage, GeneratedCopyVariant } from '@ada/shared';
import { AppError } from '../../lib/errors.js';
import { createCreative } from '../creatives.js';
import type { AutoScanner } from '../auto-scan/index.js';
import { getPreviewManifest } from './previews.js';

export interface ConfirmGeneratedCreativesInput {
  /** Confirm every image in one generated variant (all IAB sizes). */
  variantId?: string;
  /** Or confirm an explicit subset of image URLs from the manifest. */
  imageUrls?: string[];
  /**
   * Historically became each created Creative's clickUrl, but is no longer
   * used for that (Fix 5, adversarial review) — see the module doc below.
   * Kept in the request shape only because the route schema still requires
   * it; not used to select the manifest either (getPreviewManifest is keyed
   * by advertiserId alone, one manifest per advertiser).
   */
  landingUrl: string;
}

/**
 * Turns a subset of a previously generated preview manifest into real
 * `Creative` docs via the normal `createCreative` path (same auto-scan /
 * reviewStatus flow as a hand-uploaded creative — generated is never
 * pre-approved). Only ever creates creatives for image URLs that are
 * actually present in *this advertiser's* stored manifest — never accepts
 * arbitrary client-supplied URLs, which would otherwise let anyone register
 * an arbitrary externally-hosted image as a "generated" creative bypassing
 * nothing (createCreative itself re-runs auto-scan regardless), but more
 * importantly would let the confirm step be used to graft unrelated
 * variant/copy data together in the manifest across advertisers.
 *
 * Fix 5 (adversarial review): each created Creative's `clickUrl` is always
 * `manifest.landingUrl` — the SSRF-validated, redirect-resolved URL actually
 * fetched at generate time (`extractSiteContext`'s `finalUrl`, see
 * generate.ts) — never `input.landingUrl` from this confirm call. The
 * confirm body's landingUrl was never itself run through the SSRF guard;
 * trusting it as the clickUrl would let a caller attach an arbitrary/unsafe
 * URL to a creative that otherwise looks like it went through the validated
 * generation pipeline.
 */
export async function confirmGeneratedCreatives(
  advertiserId: string,
  input: ConfirmGeneratedCreativesInput,
  scanner: AutoScanner,
): Promise<Creative[]> {
  const manifest = await getPreviewManifest(advertiserId);
  if (!manifest) {
    throw new AppError(
      404,
      'Engin forskoðun fannst. Búðu til auglýsingatillögur áður en þú staðfestir.',
      'NOT_FOUND',
    );
  }

  const flat: Array<{ image: GeneratedPreviewImage; copy: GeneratedCopyVariant }> = [];
  for (const variant of manifest.variants) {
    for (const image of variant.images) {
      flat.push({ image, copy: variant.copy });
    }
  }

  let selected: Array<{ image: GeneratedPreviewImage; copy: GeneratedCopyVariant }>;

  if (input.variantId) {
    const variant = manifest.variants.find((v) => v.variantId === input.variantId);
    if (!variant) {
      throw new AppError(404, 'Valið afbrigði fannst ekki í forskoðuninni.', 'NOT_FOUND');
    }
    // Split-flow manifests (creative-wizard, 2026-07-27 plan) can have a
    // variant with copy but no rendered images yet — status 'copy', before
    // /generate/render has run for it. Confirming that would create
    // zero Creative docs silently; reject it explicitly instead.
    if (variant.images.length === 0) {
      throw new AppError(
        400,
        'Þetta afbrigði hefur ekki verið útbúið sem útlit ennþá. Veldu stærðir og útlit áður en þú staðfestir.',
        'BAD_REQUEST',
      );
    }
    selected = variant.images.map((image) => ({ image, copy: variant.copy }));
  } else if (input.imageUrls && input.imageUrls.length > 0) {
    selected = input.imageUrls.map((url) => {
      const found = flat.find((f) => f.image.url === url);
      if (!found) {
        throw new AppError(
          400,
          'Ein eða fleiri valdar myndir tilheyra ekki þessari forskoðun.',
          'BAD_REQUEST',
        );
      }
      return found;
    });
  } else {
    throw new AppError(400, 'variantId eða images er nauðsynlegt.', 'BAD_REQUEST');
  }

  const created: Creative[] = [];
  for (const { image, copy } of selected) {
    const ocrTextHint = `${copy.headline} ${copy.subline} ${copy.cta}`.trim().slice(0, 500);
    const creative = await createCreative(
      advertiserId,
      {
        imageUrl: image.url,
        width: image.width,
        height: image.height,
        clickUrl: manifest.landingUrl,
        ocrTextHint,
      },
      scanner,
    );
    created.push(creative);
  }
  return created;
}
