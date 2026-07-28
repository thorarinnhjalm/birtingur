import { z } from 'zod';
import { Hono } from 'hono';
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
import { generateCreativePreviews } from '../services/ai-creative/generate.js';
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

const GenerateBodySchema = z.object({
  landingUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), { message: 'landingUrl must use https://' }),
  variants: z.number().int().min(1).max(3).optional(),
});

// AI creative assistance (Phase 2, docs/superpowers/plans/2026-07-27-ai-creative-assistance.md).
// Registered above `/:id` so the literal `/generate` segment isn't shadowed
// by the `:id` param route (same reason `/stats` is registered up top).
creativesRouter.post('/generate', async (c) => {
  const user = c.get('user');
  // v1 MCP has no generation tool at all, and generation spends real Gemini
  // money per call (rate-limited but not free) — an `ak_` key reaching this
  // would only be a raw REST call, not a sanctioned agent workflow. Block it
  // even though the route is otherwise advertiser-scoped and fine.
  rejectApiKeyMutation(user, 'generate creatives');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) {
    throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  }

  const body = GenerateBodySchema.parse(await c.req.json());

  // Fix 2 (adversarial review): validate/fetch the landing page BEFORE
  // consuming a rate-limit slot. An SSRF-unsafe or unreachable URL is a bad
  // client input, not a real generation attempt — charging one of the
  // advertiser's 10 daily slots for it would be an easy way to burn through
  // their quota with garbage URLs. The rate limit still gates every actual
  // Gemini/render call below it.
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

  const { allowed } = await checkGenerationRateLimit(adv.id);
  if (!allowed) {
    throw new AppError(
      429,
      'Hámarksfjöldi sjálfvirkra tillagna á dag er náður. Reyndu aftur á morgun.',
      'RATE_LIMITED',
    );
  }

  const manifest = await generateCreativePreviews({
    advertiserId: adv.id,
    ctx,
    variantsCount: body.variants ?? 2,
    generator: creativeGenerator,
    uploader: creativeUploader,
  });
  return c.json(manifest, 201);
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
