import { GeneratedPreviewManifestSchema } from '@ada/shared';
import type { GeneratedPreviewManifest, GeneratedPreviewVariant } from '@ada/shared';
import { generateId } from '../../lib/id.js';
import type { SiteContext } from './index.js';
import type { CreativeGenerator } from './gemini.js';
import { savePreviewManifest } from './previews.js';
import { acquireScrapedLogo } from './logo.js';
import type { CreativeUploader } from './storage.js';

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
  /** Used to persist the auto-scraped logo (creative-logo-embed, 2026-08-08
   * design), if `ctx.logoCandidates` yields a viable one. */
  uploader: CreativeUploader;
}

/**
 * Step 1 of the split generation flow (creative-wizard, 2026-07-27 plan):
 * Gemini (or rule-based fallback) copy variants, plus best-effort advertiser
 * logo acquisition (creative-logo-embed, 2026-08-08 design) — no background
 * generation, no per-size banner rendering. Persists a manifest with
 * `status: 'copy'` and every variant's `images` empty; rendering is deferred
 * to `render-variant.ts`'s `renderCreativeVariant`, which only runs for the
 * ONE variant + sizes the advertiser actually picks in the "Texti" wizard
 * step.
 *
 * This step is NOT purely text-only: `acquireScrapedLogo` (logo.ts) does
 * real network I/O and, on success, one Storage upload. It fetches
 * `ctx.logoCandidates` in priority order via the SSRF-guarded
 * `ssrfGuardedFetchBinary` — each candidate capped at 1 MB / 5s — stopping at
 * the first one that normalizes to PNG/JPEG, and uploads at most once. It's
 * still fast enough for the live-copy UX (~seconds) because the work is
 * bounded (a handful of small binary fetches, not a full page fetch) and
 * every failure — network error, timeout, truncation, an unsupported/
 * undecodable image type — short-circuits straight to `null` rather than
 * retrying; it never blocks on the actually-slow parts of the old one-shot
 * route (Gemini background generation, per-size SVG rendering), which stay
 * deferred to the render step.
 */
export async function generateCreativeCopy(
  params: GenerateCreativeCopyParams,
): Promise<GeneratedPreviewManifest> {
  const { advertiserId, ctx, variantsCount, generator, uploader } = params;

  const copyVariants = await generator.generateCopy(ctx, variantsCount);

  const variants: GeneratedPreviewVariant[] = copyVariants.map((copy) => ({
    variantId: generateId('gen'),
    copy,
    images: [],
  }));

  const logo = await acquireScrapedLogo({
    advertiserId,
    candidates: ctx.logoCandidates,
    uploader,
  });

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
    logo,
    createdAt: new Date(),
    status: 'copy',
    variants,
  });
  await savePreviewManifest(manifest);
  return manifest;
}
