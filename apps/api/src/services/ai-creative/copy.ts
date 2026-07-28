import { GeneratedPreviewManifestSchema } from '@ada/shared';
import type { GeneratedPreviewManifest, GeneratedPreviewVariant } from '@ada/shared';
import { generateId } from '../../lib/id.js';
import type { SiteContext } from './index.js';
import type { CreativeGenerator } from './gemini.js';
import { savePreviewManifest } from './previews.js';

export interface GenerateCreativeCopyParams {
  advertiserId: string;
  /**
   * Already-extracted (and SSRF-validated) site context — the caller
   * (routes/creatives.ts) must run the SSRF-guarded `extractSiteContext`
   * BEFORE consuming a rate-limit slot, so this function takes the
   * already-fetched context rather than a raw `landingUrl` and re-fetching
   * it here (same reasoning as the original one-shot generate.ts).
   */
  ctx: SiteContext;
  variantsCount: number;
  generator: CreativeGenerator;
}

/**
 * Step 1 of the split generation flow (creative-wizard, 2026-07-27 plan):
 * Gemini (or rule-based fallback) copy variants only — no background
 * generation, no rendering, no Storage uploads. Persists a manifest with
 * `status: 'copy'` and every variant's `images` empty; rendering is deferred
 * to `render-variant.ts`'s `renderCreativeVariant`, which only runs for the
 * ONE variant + sizes the advertiser actually picks in the "Texti" wizard
 * step. Keeping this step text-only is what makes it fast enough (~seconds)
 * to show as live copy suggestions before any rendering cost is paid.
 */
export async function generateCreativeCopy(
  params: GenerateCreativeCopyParams,
): Promise<GeneratedPreviewManifest> {
  const { advertiserId, ctx, variantsCount, generator } = params;

  const copyVariants = await generator.generateCopy(ctx, variantsCount);

  const variants: GeneratedPreviewVariant[] = copyVariants.map((copy) => ({
    variantId: generateId('gen'),
    copy,
    images: [],
  }));

  const manifest = GeneratedPreviewManifestSchema.parse({
    id: advertiserId,
    advertiserId,
    landingUrl: ctx.url,
    extract: {
      title: ctx.title,
      description: ctx.description,
      siteName: ctx.siteName,
      ogImage: ctx.ogImage,
    },
    createdAt: new Date(),
    status: 'copy',
    variants,
  });
  await savePreviewManifest(manifest);
  return manifest;
}
