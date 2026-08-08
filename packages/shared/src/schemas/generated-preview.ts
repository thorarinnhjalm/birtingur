import { z } from 'zod';

/**
 * Server-generated banner-copy variant (AI creative assistance, Phase 2).
 * Character caps mirror the Nordic-editorial banner templates' text boxes —
 * long copy would overflow the smallest IAB size (320x100). Also the schema
 * `editedCopy` in `/v1/creatives/generate/render` is validated against
 * (creative-wizard, 2026-07-27 plan) — user-edited copy is held to the same
 * length caps as AI-generated copy so it can never overflow a template box.
 */
export const GeneratedCopyVariantSchema = z.object({
  // `.trim()` runs BEFORE `.min(1)` (Zod applies transforms in declaration
  // order) so whitespace-only copy — e.g. an advertiser's `editedCopy`
  // consisting of just spaces — 400s here instead of silently persisting as
  // "valid" blank text that only fails visibly once rendered onto a banner.
  headline: z.string().trim().min(1).max(30),
  subline: z.string().trim().min(1).max(60),
  cta: z.string().trim().min(1).max(15),
});
export type GeneratedCopyVariant = z.infer<typeof GeneratedCopyVariantSchema>;

/** One rendered banner image for a single IAB size within a generated variant. */
export const GeneratedPreviewImageSchema = z.object({
  sizeKey: z.string().min(1), // e.g. "728x90", matches IAB_STANDARD_SIZES
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  url: z.string().url(),
});
export type GeneratedPreviewImage = z.infer<typeof GeneratedPreviewImageSchema>;

/**
 * Best-effort landing-page extract, persisted on the manifest at the copy
 * step (`/v1/creatives/generate/copy`) so the later, separate render step
 * (`/v1/creatives/generate/render`) can generate a background image from the
 * same site context without re-fetching (and re-running the SSRF guard
 * against) the landing page a second time. Mirrors `SiteContext` in
 * `apps/api/src/services/ai-creative/index.ts` minus the (redundant) `url`
 * field, which the manifest already stores as `landingUrl`.
 */
export const ExtractedSiteContextSchema = z.object({
  title: z.string(),
  description: z.string(),
  siteName: z.string(),
  ogImage: z.string().url().optional(),
});
export type ExtractedSiteContext = z.infer<typeof ExtractedSiteContextSchema>;

/** Which hand-designed Nordic-editorial banner template a variant was (or
 * will be) rendered with — mirrors `TemplateId` in `services/ai-creative/
 * templates.ts`. Duplicated here (not imported) because `@ada/shared` has no
 * dependency on `apps/api`. */
export const GeneratedTemplateIdSchema = z.enum(['bold', 'light']);
export type GeneratedTemplateId = z.infer<typeof GeneratedTemplateIdSchema>;

/**
 * One copy variant, optionally rendered across a chosen set of IAB sizes.
 * `images` starts empty right after the copy step (`status: 'copy'`) — only
 * `/v1/creatives/generate/render` populates it, for exactly the sizes the
 * advertiser asked for (not necessarily every IAB size, per the creative-
 * wizard split — see the module-level manifest doc below).
 */
export const GeneratedPreviewVariantSchema = z.object({
  variantId: z.string().min(1),
  copy: GeneratedCopyVariantSchema,
  images: z.array(GeneratedPreviewImageSchema),
  /** Set once this variant has been rendered; absent while status is 'copy'. */
  templateId: GeneratedTemplateIdSchema.optional(),
  /**
   * True when `copy` was replaced by advertiser-supplied `editedCopy` at
   * render time rather than being the original Gemini/rule-based output.
   * Edited copy bypasses the Gemini claims guardrail by definition (it's
   * the advertiser's own words) — the responsibility confirmation shown in
   * the wizard's review step plus auto-scan at `/generate/confirm` are the
   * designed backstop, not this field; it exists purely as an audit trail.
   */
  edited: z.boolean().optional(),
});
export type GeneratedPreviewVariant = z.infer<typeof GeneratedPreviewVariantSchema>;

export const GeneratedPreviewManifestStatusSchema = z.enum(['copy', 'rendered']);
export type GeneratedPreviewManifestStatus = z.infer<typeof GeneratedPreviewManifestStatusSchema>;

/**
 * Advertiser logo persisted on the manifest for banner compositing
 * (creative-logo-embed, 2026-08-08 design). `mime` deliberately excludes
 * `image/svg+xml` — an uploaded/scraped SVG logo is rasterized to PNG before
 * storage, so nothing downstream (the resvg-js compositing step) ever has to
 * parse SVG as a foreign asset type.
 */
export const GeneratedLogoSchema = z.object({
  url: z.string().url(),
  storagePath: z.string().min(1),
  mime: z.enum(['image/png', 'image/jpeg']),
  source: z.enum(['scraped', 'uploaded']),
});
export type GeneratedLogo = z.infer<typeof GeneratedLogoSchema>;

/**
 * Server-side record of the split `/v1/creatives/generate/copy` +
 * `/v1/creatives/generate/render` flow (creative-wizard, 2026-07-27 plan;
 * originally a one-shot `/v1/creatives/generate`), keyed by advertiser (one
 * doc per advertiser — a later copy call overwrites the manifest, which is
 * acceptable because confirm normally happens right after render and the
 * rate limits already bound how many manifests/renders can be produced per
 * day). `status` tracks where in the flow the manifest is: `'copy'` right
 * after `/generate/copy` (variants have text but empty `images`), `'rendered'`
 * once `/generate/render` has populated at least one variant's `images`.
 * `/v1/creatives/generate/confirm` reads this doc to validate that the image
 * URLs the advertiser is confirming were actually produced for them, rather
 * than trusting arbitrary client-supplied URLs.
 */
export const GeneratedPreviewManifestSchema = z.object({
  id: z.string().min(1), // == advertiserId
  advertiserId: z.string().min(1),
  landingUrl: z.string().url(),
  // Optional (Fix 6, self-healing tolerance): the previously-deployed
  // one-shot `/v1/creatives/generate` route never persisted an `extract`
  // field at all. Without this, any manifest that route wrote and left
  // sitting in Firestore across this PR's deploy would fail to parse in
  // `getPreviewManifest`/`/generate/confirm` until the advertiser's next
  // `/generate/copy` call overwrites it with a fresh (extract-bearing)
  // manifest — better to tolerate the gap than 500 on a stale-but-valid doc.
  extract: ExtractedSiteContextSchema.optional(),
  /** Advertiser logo for banner compositing (2026-08-08 design). Null/absent =
   * no logo (render exactly as before). `scraped` = auto-found on the landing
   * page at the copy step; `uploaded` = advertiser override via
   * POST /v1/creatives/generate/logo. Never rendered without the advertiser
   * having seen it in the wizard's "Útlit" step. */
  logo: GeneratedLogoSchema.nullable().optional(),
  createdAt: z.date(),
  // Defaults to 'rendered' (Fix 6, same reasoning as `extract` above): the
  // old one-shot route never wrote a `status` field either, but its
  // manifests always had every variant's `images` fully populated — the
  // semantic equivalent of today's 'rendered' state — so defaulting to that
  // (rather than erroring on a missing field) preserves the old route's
  // manifests' actual meaning instead of misreading them as still `'copy'`.
  status: GeneratedPreviewManifestStatusSchema.default('rendered'),
  variants: z.array(GeneratedPreviewVariantSchema).min(1),
});
export type GeneratedPreviewManifest = z.infer<typeof GeneratedPreviewManifestSchema>;
