import { IAB_STANDARD_SIZES, GeneratedPreviewManifestSchema } from '@ada/shared';
import type { GeneratedPreviewManifest, GeneratedPreviewVariant } from '@ada/shared';
import { generateId } from '../../lib/id.js';
import type { SiteContext } from './index.js';
import type { CreativeGenerator } from './gemini.js';
import type { CreativeUploader } from './storage.js';
import { renderBannerSvg, type TemplateId } from './templates.js';
import { renderSvgToPng } from './render.js';
import { savePreviewManifest } from './previews.js';

export interface GenerateCreativePreviewsParams {
  advertiserId: string;
  /**
   * Already-extracted (and SSRF-validated) site context — Fix 2 (adversarial
   * review): the caller (routes/creatives.ts) must run the SSRF-guarded
   * `extractSiteContext` BEFORE consuming a rate-limit slot, so this
   * function takes the already-fetched context rather than a raw
   * `landingUrl` and re-fetching it here.
   */
  ctx: SiteContext;
  variantsCount: number;
  generator: CreativeGenerator;
  uploader: CreativeUploader;
}

/**
 * Full v1(+v1.5) generation pipeline: copy -> (optional background) ->
 * render every IAB size -> upload -> persist manifest. Does NOT create any
 * `Creative` docs — that only happens in the confirm step (services/
 * ai-creative not creatives.ts), so generated previews are never
 * auto-published.
 */
export async function generateCreativePreviews(
  params: GenerateCreativePreviewsParams,
): Promise<GeneratedPreviewManifest> {
  const { advertiserId, ctx, variantsCount, generator, uploader } = params;

  const copyVariants = await generator.generateCopy(ctx, variantsCount);

  const variants: GeneratedPreviewVariant[] = [];
  for (let i = 0; i < copyVariants.length; i++) {
    const copy = copyVariants[i];
    if (!copy) continue;
    const templateId: TemplateId = i % 2 === 0 ? 'bold' : 'light';

    // One background call per variant, reused across every IAB size below —
    // generating a fresh image per size would multiply the per-generate
    // Gemini image cost 5x (one per IAB_STANDARD_SIZES entry) for no visual
    // benefit, since `preserveAspectRatio="xMidYMid slice"` lets one ambient
    // image crop cleanly to any of the banner aspect ratios.
    const backgroundPng = templateId === 'bold' ? await generator.generateBackground(ctx, i) : null;
    // Fix 2 (perf/maxDuration): base64-encode the PNG buffer ONCE per
    // variant here, not once per size inside renderBannerSvg — the encoded
    // data-URI string can be megabytes, and redoing that work
    // IAB_STANDARD_SIZES.length (5) times per variant was a meaningful
    // contributor to /generate risking the function's maxDuration.
    const backgroundPngBase64 = backgroundPng ? backgroundPng.toString('base64') : null;

    const variantId = generateId('gen');
    const uploadedImages: GeneratedPreviewVariant['images'] = [];
    for (const size of IAB_STANDARD_SIZES) {
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
      uploadedImages.push({
        sizeKey: `${size.width}x${size.height}`,
        width: size.width,
        height: size.height,
        url,
      });
    }

    variants.push({ variantId, copy, images: uploadedImages });
  }

  const manifest = GeneratedPreviewManifestSchema.parse({
    id: advertiserId,
    advertiserId,
    landingUrl: ctx.url,
    createdAt: new Date(),
    variants,
  });
  await savePreviewManifest(manifest);
  return manifest;
}
