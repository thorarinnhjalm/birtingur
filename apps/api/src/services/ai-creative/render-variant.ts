import { GeneratedPreviewManifestSchema } from '@ada/shared';
import type {
  GeneratedCopyVariant,
  GeneratedPreviewImage,
  GeneratedPreviewManifest,
} from '@ada/shared';
import { AppError } from '../../lib/errors.js';
import type { SiteContext } from './index.js';
import type { CreativeGenerator } from './gemini.js';
import type { CreativeUploader } from './storage.js';
import { renderBannerSvg, type TemplateId } from './templates.js';
import { renderSvgToPng } from './render.js';
import { savePreviewManifest } from './previews.js';

export interface RenderCreativeVariantParams {
  /** Already-fetched manifest (routes/creatives.ts fetches it once, to
   * validate the variantId BEFORE consuming a rate-limit slot, then passes
   * it here rather than this function re-reading Firestore). */
  manifest: GeneratedPreviewManifest;
  variantId: string;
  /**
   * User-edited headline/subline/CTA (route-level Zod validation already
   * enforced the same `GeneratedCopyVariantSchema` length caps AI copy is
   * held to). When present it REPLACES the variant's stored copy wholesale
   * and is persisted as-is — see the `edited` flag doc on
   * `GeneratedPreviewVariantSchema` for why that's an acceptable bypass of
   * the Gemini claims guardrail.
   */
  editedCopy?: GeneratedCopyVariant;
  /** Non-empty, route-validated subset of IAB_STANDARD_SIZES — renders ONLY
   * these, not every IAB size (the split flow's whole point). */
  sizes: Array<{ width: number; height: number }>;
  templateId: TemplateId;
  generator: CreativeGenerator;
  uploader: CreativeUploader;
}

/**
 * Step 2 of the split generation flow (creative-wizard, 2026-07-27 plan) —
 * what used to be all of generate.ts's one-shot orchestration (copy +
 * background + render-every-IAB-size + upload), now scoped to the ONE
 * variant and ONE caller-chosen {sizes, templateId} the advertiser picked in
 * the wizard's "Útlit" step. Renders and re-uploads that variant's `images`
 * (replacing whatever was there before, e.g. from an earlier render attempt
 * with different sizes) and flips the manifest to `status: 'rendered'`.
 */
export async function renderCreativeVariant(
  params: RenderCreativeVariantParams,
): Promise<GeneratedPreviewManifest> {
  const { manifest, variantId, editedCopy, sizes, templateId, generator, uploader } = params;
  const advertiserId = manifest.advertiserId;

  const variantIndex = manifest.variants.findIndex((v) => v.variantId === variantId);
  if (variantIndex === -1) {
    throw new AppError(404, 'Valið afbrigði fannst ekki í forskoðuninni.', 'NOT_FOUND');
  }
  const variant = manifest.variants[variantIndex]!;

  const copy: GeneratedCopyVariant = editedCopy ?? variant.copy;
  const edited = !!editedCopy;

  // Reconstruct the SiteContext from what the copy step persisted, rather
  // than re-fetching (and re-running the SSRF guard against) the landing
  // page a second time. `extract` is optional on the schema (Fix 6,
  // self-healing tolerance) purely so a manifest written by the
  // previously-deployed one-shot `/v1/creatives/generate` route — which
  // never persisted this field at all — still parses; it falls back to
  // empty strings here rather than crashing on `undefined.title`.
  const ctx: SiteContext = {
    url: manifest.landingUrl,
    title: manifest.extract?.title ?? '',
    description: manifest.extract?.description ?? '',
    siteName: manifest.extract?.siteName ?? '',
    ogImage: manifest.extract?.ogImage,
  };

  // One background call for the whole variant, reused across every
  // requested size — generating a fresh image per size would multiply the
  // per-render Gemini image cost by however many sizes were requested, for
  // no visual benefit (`preserveAspectRatio="xMidYMid slice"` lets one
  // ambient image crop cleanly to any banner aspect ratio).
  const backgroundPng =
    templateId === 'bold' ? await generator.generateBackground(ctx, variantIndex) : null;
  // Base64-encode ONCE per variant, not once per size inside renderBannerSvg
  // — the encoded data-URI string can be megabytes, and redoing that work
  // per requested size was a meaningful contributor to risking the render
  // function's maxDuration in the original one-shot implementation.
  const backgroundPngBase64 = backgroundPng ? backgroundPng.toString('base64') : null;

  const images: GeneratedPreviewImage[] = [];
  for (const size of sizes) {
    const svg = renderBannerSvg({
      width: size.width,
      height: size.height,
      copy,
      templateId,
      backgroundPng: backgroundPngBase64,
    });
    const png = renderSvgToPng(svg);
    const filename = `${variantId}-${size.width}x${size.height}.png`;
    const url = await uploader.upload({ advertiserId, filename, pngBuffer: png });
    images.push({
      sizeKey: `${size.width}x${size.height}`,
      width: size.width,
      height: size.height,
      url,
    });
  }

  const updatedVariants = [...manifest.variants];
  updatedVariants[variantIndex] = { ...variant, copy, images, templateId, edited };

  const updatedManifest = GeneratedPreviewManifestSchema.parse({
    ...manifest,
    status: 'rendered',
    variants: updatedVariants,
  });
  await savePreviewManifest(updatedManifest);
  return updatedManifest;
}
