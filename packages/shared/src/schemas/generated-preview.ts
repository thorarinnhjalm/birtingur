import { z } from 'zod';

/**
 * Server-generated banner-copy variant (AI creative assistance, Phase 2).
 * Character caps mirror the Nordic-editorial banner templates' text boxes —
 * long copy would overflow the smallest IAB size (320x100).
 */
export const GeneratedCopyVariantSchema = z.object({
  headline: z.string().min(1).max(30),
  subline: z.string().min(1).max(60),
  cta: z.string().min(1).max(15),
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

/** One copy variant rendered across all IAB sizes. */
export const GeneratedPreviewVariantSchema = z.object({
  variantId: z.string().min(1),
  copy: GeneratedCopyVariantSchema,
  images: z.array(GeneratedPreviewImageSchema).min(1),
});
export type GeneratedPreviewVariant = z.infer<typeof GeneratedPreviewVariantSchema>;

/**
 * Server-side record of a `/v1/creatives/generate` call, keyed by advertiser
 * (one doc per advertiser — a later call overwrites the manifest, which
 * is acceptable because confirm normally happens right after generate and
 * the rate limit already bounds how many manifests can be produced per day).
 * `/v1/creatives/generate/confirm` reads this doc to validate that the
 * image URLs the advertiser is confirming were actually produced for them,
 * rather than trusting arbitrary client-supplied URLs.
 */
export const GeneratedPreviewManifestSchema = z.object({
  id: z.string().min(1), // == advertiserId
  advertiserId: z.string().min(1),
  landingUrl: z.string().url(),
  createdAt: z.date(),
  variants: z.array(GeneratedPreviewVariantSchema).min(1),
});
export type GeneratedPreviewManifest = z.infer<typeof GeneratedPreviewManifestSchema>;
