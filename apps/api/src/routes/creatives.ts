import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Hono } from 'hono';
import { GeneratedCopyVariantSchema, IAB_STANDARD_SIZES } from '@ada/shared';
import { requireAuth, requireScope, rejectApiKeyMutation, type Env } from '../lib/auth.js';
import { getAdvertiserByOwnerEmail } from '../services/advertisers.js';
import {
  createCreative,
  getCreative,
  listCreativesForAdvertiser,
  updateCreative,
  deleteCreative,
} from '../services/creatives.js';
import { getCreativeStats, getAllCreativeStatsForAdvertiser } from '../services/creative-stats.js';
import { GeminiAutoScanner } from '../services/auto-scan/gemini.js';
import { GeminiCreativeGenerator } from '../services/ai-creative/gemini.js';
import { chooseCreativeUploader } from '../services/ai-creative/storage.js';
import { generateCreativeCopy } from '../services/ai-creative/copy.js';
import { renderCreativeVariant } from '../services/ai-creative/render-variant.js';
import { normalizeLogoBuffer } from '../services/ai-creative/logo.js';
import { getPreviewManifest, updatePreviewManifestLogo } from '../services/ai-creative/previews.js';
import { confirmGeneratedCreatives } from '../services/ai-creative/confirm.js';
import { SsrfBlockedError, extractSiteContext } from '../services/ai-creative/index.js';
import { checkGenerationRateLimit } from '../lib/rate-limit.js';
import { AppError } from '../lib/errors.js';

const scanner = new GeminiAutoScanner();
const creativeGenerator = new GeminiCreativeGenerator();
const creativeUploader = chooseCreativeUploader();

export const creativesRouter = new Hono<Env>();
creativesRouter.use('*', requireAuth);
creativesRouter.use('*', requireScope('advertiser'));

// Bulk stats for all creatives belonging to the authenticated advertiser
creativesRouter.get('/stats', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const hours = parseInt(c.req.query('hours') ?? '168', 10);
  const stats = await getAllCreativeStatsForAdvertiser(adv.id, hours);
  return c.json(stats);
});

// Dashboard/ID-token only — v1 MCP has no create_creative tool (agents buy
// campaigns using EXISTING creatives only, see list_creatives), and this
// path runs auto-scan (a Gemini call) per creative, i.e. real money per
// call. An `ak_` key reaching this directly would be unmetered agent-driven
// Gemini spend with no corresponding sanctioned workflow. See
// rejectApiKeyMutation.
creativesRouter.post('/', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'create creatives');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const body = await c.req.json();
  const cre = await createCreative(adv.id, body, scanner);
  return c.json(cre, 201);
});

const GenerateCopyBodySchema = z.object({
  landingUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), { message: 'landingUrl must use https://' }),
  variants: z.number().int().min(1).max(3).optional(),
});

// AI creative assistance, split generation flow (creative-wizard,
// docs/superpowers/plans/2026-07-27-creative-wizard-flow.md — supersedes the
// original one-shot `/v1/creatives/generate` from
// 2026-07-27-ai-creative-assistance.md). Registered above `/:id` so the
// literal `/generate/*` segments aren't shadowed by the `:id` param route
// (same reason `/stats` is registered up top).
//
// Step 1 of 2: SSRF-guarded extract + Gemini (or rule-based) copy variants
// only — no background generation, no rendering, no Storage uploads. Fast
// enough (~seconds) to show as live text suggestions in the wizard's "Texti"
// step before any rendering cost is paid.
creativesRouter.post('/generate/copy', async (c) => {
  const user = c.get('user');
  // v1 MCP has no generation tool at all, and this still spends real Gemini
  // money per call (rate-limited but not free) — an `ak_` key reaching this
  // would only be a raw REST call, not a sanctioned agent workflow.
  rejectApiKeyMutation(user, 'generate creative copy');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }

  const body = GenerateCopyBodySchema.parse(await c.req.json());

  // Fix 12 (adversarial review — supersedes the old Fix 2 ordering below):
  // the rate-limit check now runs BEFORE the SSRF-guarded fetch, not after.
  // `GenerateCopyBodySchema.parse` above already rejects anything that
  // isn't a syntactically-valid https:// URL for free (no network I/O), so
  // that class of bad input still never touches the rate limiter — Fix 2's
  // original goal. But `extractSiteContext` performs a real DNS lookup (and
  // then an HTTP fetch) against a caller-supplied hostname; with the old
  // ordering, a caller who had ALREADY exhausted their daily `gen-copy`
  // quota could keep POSTing arbitrary (syntactically valid, but
  // SSRF-blocked) hostnames forever and the server would still perform that
  // lookup/fetch on every single request before ever getting to the 429 —
  // an unbounded-outbound-request amplifier gated by nothing. Checking the
  // rate limit first closes that: once a caller is over quota, no fetch is
  // even attempted. The tradeoff is that a syntactically-valid but
  // SSRF-unsafe URL (e.g. an internal IP) now DOES consume a rate-limit
  // slot before being rejected — a narrower, already-authenticated-caller
  // cost that's acceptable in exchange for closing the unbounded-fetch gap.
  const { allowed } = await checkGenerationRateLimit('gen-copy', adv.id);
  if (!allowed) {
    throw new AppError(
      429,
      'Hámarksfjöldi textatillagna á dag er náður. Reyndu aftur á morgun.',
      'RATE_LIMITED',
    );
  }

  let ctx;
  try {
    ctx = await extractSiteContext(body.landingUrl);
  } catch (err) {
    // SsrfBlockedError signals a bad/unsafe input URL, not a server fault —
    // surface it as 400 rather than letting it fall through to the generic
    // 500 handler (it isn't an AppError, so app.onError wouldn't do this).
    if (err instanceof SsrfBlockedError) {
      throw new AppError(400, err.message, 'BAD_REQUEST');
    }
    throw err;
  }

  const manifest = await generateCreativeCopy({
    advertiserId: adv.id,
    ctx,
    variantsCount: body.variants ?? 3,
    generator: creativeGenerator,
    uploader: creativeUploader,
  });
  return c.json(manifest, 201);
});

const RenderSizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const GenerateRenderBodySchema = z.object({
  variantId: z.string().min(1),
  // Validated against the same length caps Gemini copy is held to (Zod
  // schema shared with the AI-generated shape) — see the `edited` flag doc
  // on GeneratedPreviewVariantSchema for why replacing copy here is allowed
  // to bypass the Gemini claims guardrail.
  editedCopy: GeneratedCopyVariantSchema.optional(),
  sizes: z.array(RenderSizeSchema).min(1),
  templateId: z.enum(['bold', 'light']),
});

const VALID_IAB_SIZE_KEYS = new Set(IAB_STANDARD_SIZES.map((s) => `${s.width}x${s.height}`));

// Step 2 of 2: renders ONLY the requested variant + sizes (background image
// generated once, not once per size — same perf reasoning the one-shot route
// used) and uploads them, replacing that variant's copy/images in the
// manifest and flipping its status to 'rendered'.
creativesRouter.post('/generate/render', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'render generated creatives');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }

  const body = GenerateRenderBodySchema.parse(await c.req.json());

  // `sizes` must be a subset of the IAB standard list — computeBannerLayout's
  // tier logic is designed/tested against exactly these sizes, and it's also
  // how the wizard promises "only the sizes you need" (the read-only
  // /categories/sizes insight is itself IAB-based).
  const invalidSize = body.sizes.find((s) => !VALID_IAB_SIZE_KEYS.has(`${s.width}x${s.height}`));
  if (invalidSize) {
    throw new AppError(
      400,
      `Óþekkt borðastærð: ${invalidSize.width}x${invalidSize.height}`,
      'BAD_REQUEST',
    );
  }

  const manifest = await getPreviewManifest(adv.id);
  if (!manifest) {
    throw new AppError(
      404,
      'Enginn auglýsingatexti fannst. Búðu til texta áður en þú útbýrð útlit.',
      'NOT_FOUND',
    );
  }
  if (!manifest.variants.some((v) => v.variantId === body.variantId)) {
    throw new AppError(404, 'Valið afbrigði fannst ekki í forskoðuninni.', 'NOT_FOUND');
  }

  // Validated the request (bad variantId/sizes) BEFORE charging one of the
  // advertiser's daily render slots — same "don't charge for garbage input"
  // principle as the copy route's SSRF-before-rate-limit ordering above.
  const { allowed } = await checkGenerationRateLimit('gen-render', adv.id);
  if (!allowed) {
    throw new AppError(
      429,
      'Hámarksfjöldi útlitsgerða á dag er náður. Reyndu aftur á morgun.',
      'RATE_LIMITED',
    );
  }

  const updated = await renderCreativeVariant({
    manifest,
    variantId: body.variantId,
    editedCopy: body.editedCopy,
    sizes: body.sizes,
    templateId: body.templateId,
    generator: creativeGenerator,
    uploader: creativeUploader,
  });
  return c.json(updated, 201);
});

const ConfirmBodySchema = z
  .object({
    variantId: z.string().min(1).optional(),
    imageUrls: z.array(z.string().url()).optional(),
    landingUrl: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), { message: 'landingUrl must use https://' }),
  })
  .refine((b) => !!b.variantId || (b.imageUrls && b.imageUrls.length > 0), {
    message: 'variantId or imageUrls is required',
  });

creativesRouter.post('/generate/confirm', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'confirm generated creatives');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }

  const body = ConfirmBodySchema.parse(await c.req.json());
  const created = await confirmGeneratedCreatives(adv.id, body, scanner);
  return c.json(created, 201);
});

const UploadLogoBodySchema = z.object({
  imageBase64: z.string().min(1).max(1_400_000), // ~1MB after base64 inflation
  mime: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
});

// Advertiser logo upload-override for the wizard's "Útlit" step
// (creative-logo-embed, 2026-08-08 design): lets the advertiser replace
// whatever `/generate/copy` auto-scraped (or supply one when scraping found
// nothing) before rendering. Registered here (with the other `/generate/*`
// literals) for the same routing reason as `/generate/copy` etc. — literal
// segments must come before the `:id` param route below.
creativesRouter.post('/generate/logo', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'upload creative logo');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }

  // MINOR-5 (adversarial review): free syntactic validation (Zod parse)
  // before the paid/quota'd rate-limit check — same "reject garbage for
  // free first" ordering the copy/render routes already use (see the Fix 12
  // comment on the copy route above). Previously the rate limit ran first,
  // so a malformed body could consume a caller's daily gen-logo quota before
  // ever being rejected.
  const body = UploadLogoBodySchema.parse(await c.req.json());

  const { allowed } = await checkGenerationRateLimit('gen-logo', adv.id);
  if (!allowed) {
    throw new AppError(429, 'Hámarksfjöldi lógó-upphleðslna á dag er náður.', 'RATE_LIMITED');
  }

  const raw = Buffer.from(body.imageBase64, 'base64');
  if (raw.length === 0 || raw.length > 1024 * 1024) {
    throw new AppError(400, 'Lógó má mest vera 1MB', 'BAD_REQUEST');
  }
  const normalized = normalizeLogoBuffer(raw, body.mime);
  if (!normalized) {
    throw new AppError(400, 'Ógild eða óstudd lógómynd', 'BAD_REQUEST');
  }

  // Fail fast (before any Storage I/O) when there's no manifest to attach a
  // logo to — the actual write below is a field-level update (MINOR-6), but
  // this upfront existence check is what avoids paying for an upload that
  // would just be discarded on a 404.
  const manifest = await getPreviewManifest(adv.id);
  if (!manifest) {
    throw new AppError(404, 'No generation in progress', 'NOT_FOUND');
  }

  const uploader = chooseCreativeUploader();
  const ext = normalized.mime === 'image/png' ? 'png' : 'jpg';
  const filename = `logo_${randomUUID()}.${ext}`;
  const url = await uploader.upload({
    advertiserId: adv.id,
    filename,
    pngBuffer: normalized.buffer,
    contentType: normalized.mime,
  });
  // MINOR-6 (adversarial review): field-level update of ONLY `logo`, not a
  // read-spread-write of the whole manifest — see the doc comment on
  // updatePreviewManifestLogo for the race this closes (a concurrent render
  // save resurrecting a stale logo). Re-checks existence internally (in case
  // the manifest was deleted between the check above and here) and returns
  // the freshly re-read manifest.
  const updated = await updatePreviewManifestLogo(adv.id, {
    url,
    storagePath: `creatives/${adv.id}/${filename}`,
    mime: normalized.mime,
    source: 'uploaded' as const,
  });
  if (!updated) {
    throw new AppError(404, 'No generation in progress', 'NOT_FOUND');
  }
  return c.json(updated);
});

// Skip/clear action for the wizard's "Útlit" step's logo picker — reverts to
// rendering without a logo (or drops back to whatever `/generate/copy`
// scraped, if the advertiser re-runs it) without needing a whole new manifest.
creativesRouter.delete('/generate/logo', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'remove creative logo');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  // MINOR-6 (adversarial review): field-level update, not read-spread-write
  // — see updatePreviewManifestLogo's doc comment. Its own existence check
  // supplies the 404-when-no-manifest semantics this route already had.
  const updated = await updatePreviewManifestLogo(adv.id, null);
  if (!updated) {
    throw new AppError(404, 'No generation in progress', 'NOT_FOUND');
  }
  return c.json(updated);
});

creativesRouter.get('/', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const list = await listCreativesForAdvertiser(adv.id);
  return c.json(list);
});

creativesRouter.get('/:id/stats', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const cre = await getCreative(c.req.param('id'));
  if (!cre) {
    throw new AppError(404, 'Creative not found', 'NOT_FOUND');
  }
  if (cre.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const stats = await getCreativeStats(cre.id);
  return c.json(stats);
});

creativesRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const cre = await getCreative(c.req.param('id'));
  if (!cre) {
    throw new AppError(404, 'Creative not found', 'NOT_FOUND');
  }
  if (cre.advertiserId !== adv.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  return c.json(cre);
});

// Dashboard/ID-token only — no MCP tool exposes creative PATCH, and this path
// re-triggers auto-scan (updateCreative -> propagateCreativeChange), so an
// `ak_` key using it would be a self-approval vector for its own rejected
// creative. See rejectApiKeyMutation.
creativesRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'update creatives');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  const body = await c.req.json();
  const updated = await updateCreative(id, adv.id, body, scanner);
  return c.json(updated);
});

creativesRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'delete creatives');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }
  const id = c.req.param('id');
  await deleteCreative(id, adv.id);
  return c.json({ success: true }, 200);
});
