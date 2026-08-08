# Advertiser Logo in Generated Creatives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The creative wizard scrapes the advertiser's logo from their landing page (confirm/skip/upload-override in the wizard), and rendered banners composite it on a contrast-safe chip at a fixed position per template.

**Architecture:** `extractSiteContext` gains logo-candidate extraction; a new `logo.ts` service fetches the best candidate through a new binary variant of the SSRF-guarded fetch, normalizes (SVG→PNG via resvg), uploads to Storage, and records `logo` on the `generated_previews` manifest. New `POST`/`DELETE /v1/creatives/generate/logo` endpoints handle upload-override and skip. `renderBannerSvg` composites the logo like it already composites the `bold` background (base64 data URI under resvg). Spec: `docs/superpowers/specs/2026-08-08-creative-logo-embed-design.md`.

**Tech Stack:** TypeScript ESM, Hono, Zod, `@resvg/resvg-js`, firebase-admin Storage, Vitest, React 19 + TanStack Query.

## Global Constraints

- ESM: relative imports inside a package use the `.js` extension even from `.ts` sources; `apps/api/tests/*` follows the existing no-suffix import style.
- API tests run against the Firestore emulator; single-file runs wrapped: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/<file>.ts"`. Never run two emulator invocations concurrently (port contention corrupts results — learned 2026-08-08).
- Dashboard tests are plain vitest, and the package has NO jest-dom: use `getBy*` + `toBeDefined()` for presence, `queryBy*` + `toBeNull()` for absence.
- `@ada/shared` is the dependency root: after editing its schemas run `pnpm --filter @ada/shared build` before typechecking dependents.
- All UI copy Icelandic. Dashboard styling uses existing Tailwind classes/brand tokens (raw hex is fine inside server-side SVG generation in `templates.ts`, which already uses it).
- Logo acquisition is best-effort end to end: every failure lands on `logo: null`, never an error surfaced to the wizard, and a missing logo never fails a render.
- Allowed logo formats: `image/png`, `image/jpeg` (stored as-is), `image/svg+xml` (rasterized to PNG at 512px long edge). Everything else is skipped/rejected. Fetch cap 1 MB.
- Branch: `feat/creative-logo-embed` off `docs/creative-logo-embed`. Never push `main` (oruggt-ship).

---

### Task 1: Shared schema + binary SSRF-guarded fetch

**Files:**

- Modify: `packages/shared/src/schemas/generated-preview.ts`
- Modify: `apps/api/src/services/ai-creative/ssrf.ts`
- Test: `apps/api/tests/ai-creative-ssrf.test.ts` (append; follow the file's existing fetch-mocking pattern)

**Interfaces:**

- Consumes: existing `ssrfGuardedFetch` internals (`assertSafeUrl`, redirect loop).
- Produces:

```ts
// @ada/shared
export const GeneratedLogoSchema = z.object({
  url: z.string().url(),
  storagePath: z.string().min(1),
  mime: z.enum(['image/png', 'image/jpeg']),
  source: z.enum(['scraped', 'uploaded']),
});
export type GeneratedLogo = z.infer<typeof GeneratedLogoSchema>;
// GeneratedPreviewManifestSchema gains: logo: GeneratedLogoSchema.nullable().optional()

// ssrf.ts
export interface SafeBinaryFetchResult {
  body: Buffer;
  finalUrl: string;
  contentType: string | null;
  truncated: boolean; // true when the cap cut the body off — callers must discard
}
export async function ssrfGuardedFetchBinary(
  urlString: string,
  opts?: { maxBytes?: number }, // default 1 MB
): Promise<SafeBinaryFetchResult>;
```

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/tests/ai-creative-ssrf.test.ts`, reusing however that file already stubs `global.fetch` (it tests `ssrfGuardedFetch` today — mirror its mocking helpers; public hostnames resolve via the same mocked/`lookup` path the existing tests use):

```ts
describe('ssrfGuardedFetchBinary', () => {
  it('returns raw bytes and content type', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    mockFetchOnce({ status: 200, headers: { 'content-type': 'image/png' }, body: png });
    const res = await ssrfGuardedFetchBinary('https://example.com/logo.png');
    expect(res.contentType).toBe('image/png');
    expect(Buffer.compare(res.body, png)).toBe(0);
    expect(res.truncated).toBe(false);
  });

  it('marks bodies over the cap as truncated', async () => {
    mockFetchOnce({
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.alloc(64 * 1024, 1),
    });
    const res = await ssrfGuardedFetchBinary('https://example.com/big.png', {
      maxBytes: 16 * 1024,
    });
    expect(res.truncated).toBe(true);
  });

  it('applies the SSRF guard (https only)', async () => {
    await expect(ssrfGuardedFetchBinary('http://example.com/logo.png')).rejects.toThrow(
      SsrfBlockedError,
    );
  });
});
```

If the existing file has no reusable `mockFetchOnce` helper, add one next to the new tests (a `vi.spyOn(globalThis, 'fetch')` returning a `Response` built from the given body/headers/status), matching the style already present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/ai-creative-ssrf.test.ts"`
Expected: new tests FAIL (`ssrfGuardedFetchBinary` not exported); existing tests PASS.

- [ ] **Step 3: Implement**

1. `generated-preview.ts`: add `GeneratedLogoSchema`/`GeneratedLogo` (code above, with a doc comment noting the mime enum deliberately excludes svg — SVG is rasterized to PNG before storage) and add to the manifest schema, after `extract`:

```ts
/** Advertiser logo for banner compositing (2026-08-08 design). Null/absent =
 * no logo (render exactly as before). `scraped` = auto-found on the landing
 * page at the copy step; `uploaded` = advertiser override via
 * POST /v1/creatives/generate/logo. Never rendered without the advertiser
 * having seen it in the wizard's "Útlit" step. */
logo: GeneratedLogoSchema.nullable().optional(),
```

2. `ssrf.ts`: refactor the body-reading tail of `ssrfGuardedFetch` into a shared core so the redirect/validation loop exists once:

```ts
async function ssrfGuardedFetchCore(
  urlString: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; finalUrl: string; contentType: string | null; truncated: boolean }> {
  // identical loop to today's ssrfGuardedFetch, except the success path
  // reads into chunks with `truncated = total > maxBytes` and returns the
  // Buffer instead of a utf-8 string
}

export async function ssrfGuardedFetch(urlString: string): Promise<SafeFetchResult> {
  const { buffer, finalUrl, contentType } = await ssrfGuardedFetchCore(urlString, MAX_BODY_BYTES);
  return { body: buffer.toString('utf-8'), finalUrl, contentType };
}

const MAX_BINARY_BYTES = 1024 * 1024;
export async function ssrfGuardedFetchBinary(
  urlString: string,
  opts?: { maxBytes?: number },
): Promise<SafeBinaryFetchResult> {
  const { buffer, finalUrl, contentType, truncated } = await ssrfGuardedFetchCore(
    urlString,
    opts?.maxBytes ?? MAX_BINARY_BYTES,
  );
  return { body: buffer, finalUrl, contentType, truncated };
}
```

Preserve today's exact behavior for the string path (including the reader-less fallback `response.text()` branch).

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/ai-creative-ssrf.test.ts"`
Expected: PASS. Then `pnpm --filter @ada/shared build && pnpm --filter @ada/shared test && pnpm --filter @ada/api typecheck`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/generated-preview.ts apps/api/src/services/ai-creative/ssrf.ts apps/api/tests/ai-creative-ssrf.test.ts
git commit -m "feat(api): binary SSRF-guarded fetch and manifest logo schema"
```

---

### Task 2: Candidate extraction + logo acquisition at the copy step

**Files:**

- Modify: `apps/api/src/services/ai-creative/index.ts` (`SiteContext`, `extractSiteContext`)
- Create: `apps/api/src/services/ai-creative/logo.ts`
- Modify: `apps/api/src/services/ai-creative/storage.ts` (optional `contentType` on upload)
- Modify: `apps/api/src/services/ai-creative/copy.ts` (acquire + persist)
- Test: `apps/api/tests/ai-creative-logo.test.ts` (new)

**Interfaces:**

- Consumes: `ssrfGuardedFetchBinary` (Task 1), `CreativeUploader` (`storage.ts`), `Resvg` from `@resvg/resvg-js` (used the same way `render.ts` uses it).
- Produces:

```ts
// index.ts — SiteContext gains:
logoCandidates: string[]; // absolute URLs, priority-ordered, possibly empty

// logo.ts
export async function acquireScrapedLogo(params: {
  advertiserId: string;
  candidates: string[];
  uploader: CreativeUploader;
}): Promise<GeneratedLogo | null>;
export function normalizeLogoBuffer(
  buffer: Buffer,
  contentType: string,
): { buffer: Buffer; mime: 'image/png' | 'image/jpeg' } | null; // null = unsupported/undecodable

// storage.ts — CreativeUploader.upload params gain:
contentType?: 'image/png' | 'image/jpeg'; // default 'image/png'
```

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/ai-creative-logo.test.ts`. Mock `../src/services/ai-creative/ssrf` (so no network) and use `StubCreativeUploader`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchBinaryMock = vi.fn();
vi.mock('../src/services/ai-creative/ssrf', async (importOriginal) => {
  const original = await importOriginal<any>();
  return { ...original, ssrfGuardedFetchBinary: (...a: unknown[]) => fetchBinaryMock(...a) };
});

import { extractSiteContext } from '../src/services/ai-creative/index';
import { acquireScrapedLogo, normalizeLogoBuffer } from '../src/services/ai-creative/logo';
import { StubCreativeUploader } from '../src/services/ai-creative/storage';

// 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

beforeEach(() => fetchBinaryMock.mockReset());

describe('logo candidate extraction', () => {
  // extractSiteContext's page fetch goes through ssrfGuardedFetch (string) —
  // mock it via the same module mock if the existing ai-creative tests do;
  // otherwise follow however categories/copy tests stub extractSiteContext's
  // fetch today. The HTML fixture is what matters:
  const HTML = `
    <html><head>
      <link rel="icon" sizes="32x32" href="/favicon-32.png">
      <link rel="apple-touch-icon" href="/apple-icon.png">
      <meta property="og:image" content="https://cdn.example.is/hero-photo.jpg">
    </head><body>
      <img class="site-logo" src="/img/logo.svg" alt="Merki">
    </body></html>`;

  it('orders candidates apple-touch-icon > img-logo > icon and never og:image', async () => {
    const ctx = await extractSiteContextFromHtml(HTML, 'https://example.is/');
    expect(ctx.logoCandidates).toEqual([
      'https://example.is/apple-icon.png',
      'https://example.is/img/logo.svg',
      'https://example.is/favicon-32.png',
    ]);
  });
});

describe('acquireScrapedLogo', () => {
  it('uploads the first viable candidate and returns a scraped logo', async () => {
    fetchBinaryMock.mockResolvedValueOnce({
      body: TINY_PNG,
      finalUrl: 'https://example.is/apple-icon.png',
      contentType: 'image/png',
      truncated: false,
    });
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/apple-icon.png'],
      uploader: new StubCreativeUploader(),
    });
    expect(logo).toMatchObject({ source: 'scraped', mime: 'image/png' });
    expect(logo!.storagePath).toMatch(/^creatives\/adv_1\/logo_/);
  });

  it('falls through failed candidates to the next one', async () => {
    fetchBinaryMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
      body: TINY_PNG,
      finalUrl: 'https://example.is/b.png',
      contentType: 'image/png',
      truncated: false,
    });
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/a.png', 'https://example.is/b.png'],
      uploader: new StubCreativeUploader(),
    });
    expect(logo).not.toBeNull();
    expect(fetchBinaryMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when every candidate fails, is truncated, or has a bad type', async () => {
    fetchBinaryMock.mockResolvedValue({
      body: TINY_PNG,
      finalUrl: 'https://example.is/x.ico',
      contentType: 'image/vnd.microsoft.icon',
      truncated: false,
    });
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/x.ico'],
      uploader: new StubCreativeUploader(),
    });
    expect(logo).toBeNull();
  });
});

describe('normalizeLogoBuffer', () => {
  it('passes png/jpeg through and rejects unsupported types', () => {
    expect(normalizeLogoBuffer(TINY_PNG, 'image/png')?.mime).toBe('image/png');
    expect(normalizeLogoBuffer(TINY_PNG, 'image/gif')).toBeNull();
  });

  it('rasterizes svg to png', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
    );
    const out = normalizeLogoBuffer(svg, 'image/svg+xml');
    expect(out?.mime).toBe('image/png');
    expect(out!.buffer.subarray(1, 4).toString()).toBe('PNG');
  });

  it('returns null for an undecodable svg', () => {
    expect(normalizeLogoBuffer(Buffer.from('<svg'), 'image/svg+xml')).toBeNull();
  });
});
```

Where the test needs `extractSiteContextFromHtml`: if `extractSiteContext` can't be exercised without its page fetch, export a small pure helper `extractLogoCandidates(html: string, baseUrl: string): string[]` from `index.ts` and test THAT directly (preferred — keep the fetch out of the candidate tests entirely; adjust the first test to call it).

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/ai-creative-logo.test.ts"`
Expected: FAIL — `logo.ts` does not exist, `extractLogoCandidates` not exported.

- [ ] **Step 3: Implement**

1. `index.ts` — pure candidate extractor, regex style matching the file (attribute order can vary, mirror the dual-pattern approach used for meta tags):

```ts
export function extractLogoCandidates(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];
  const push = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const abs = new URL(decodeHtmlEntities(raw.trim()), baseUrl).toString();
      if (!candidates.includes(abs)) candidates.push(abs);
    } catch {
      /* unparseable href — skip */
    }
  };

  // 1. apple-touch-icon (largest `sizes` first when several are declared)
  const appleIcons = [
    ...html.matchAll(/<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]*>/gi),
  ]
    .map((m) => ({
      href: m[0].match(/href=["']([^"']+)["']/i)?.[1],
      size: parseInt(m[0].match(/sizes=["'](\d+)x/i)?.[1] ?? '0', 10),
    }))
    .sort((a, b) => b.size - a.size);
  for (const icon of appleIcons) push(icon.href);

  // 2. first <img> whose src/alt/class mentions "logo"
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    if (/(?:src|alt|class)=["'][^"']*logo[^"']*["']/i.test(tag)) {
      push(tag.match(/src=["']([^"']+)["']/i)?.[1]);
      break;
    }
  }

  // 3. <link rel="icon">, largest declared size first
  const icons = [...html.matchAll(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi)]
    .map((m) => ({
      href: m[0].match(/href=["']([^"']+)["']/i)?.[1],
      size: parseInt(m[0].match(/sizes=["'](\d+)x/i)?.[1] ?? '0', 10),
    }))
    .sort((a, b) => b.size - a.size);
  for (const icon of icons) push(icon.href);

  return candidates;
}
```

Call it at the end of `extractSiteContext` (`logoCandidates: extractLogoCandidates(html, finalUrl)`) and add the field to `SiteContext`. (`og:image` stays untouched and is never a candidate.)

2. `logo.ts`:

```ts
import { Resvg } from '@resvg/resvg-js';
import { randomUUID } from 'node:crypto';
import type { GeneratedLogo } from '@ada/shared';
import { ssrfGuardedFetchBinary } from './ssrf.js';
import type { CreativeUploader } from './storage.js';

const LOGO_MAX_BYTES = 1024 * 1024;
const SVG_RASTER_SIZE = 512;

export function normalizeLogoBuffer(
  buffer: Buffer,
  contentType: string,
): { buffer: Buffer; mime: 'image/png' | 'image/jpeg' } | null {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (type === 'image/png') return { buffer, mime: 'image/png' };
  if (type === 'image/jpeg' || type === 'image/jpg') return { buffer, mime: 'image/jpeg' };
  if (type === 'image/svg+xml') {
    try {
      const resvg = new Resvg(buffer.toString('utf-8'), {
        fitTo: { mode: 'width', value: SVG_RASTER_SIZE },
      });
      return { buffer: Buffer.from(resvg.render().asPng()), mime: 'image/png' };
    } catch {
      return null;
    }
  }
  return null;
}

/** Best-effort: tries candidates in order, returns null when none works.
 * Never throws — logo acquisition must not be able to fail the copy step. */
export async function acquireScrapedLogo(params: {
  advertiserId: string;
  candidates: string[];
  uploader: CreativeUploader;
}): Promise<GeneratedLogo | null> {
  for (const candidate of params.candidates) {
    try {
      const res = await ssrfGuardedFetchBinary(candidate, { maxBytes: LOGO_MAX_BYTES });
      if (res.truncated || !res.contentType) continue;
      const normalized = normalizeLogoBuffer(res.body, res.contentType);
      if (!normalized || normalized.buffer.length === 0) continue;
      const ext = normalized.mime === 'image/png' ? 'png' : 'jpg';
      const filename = `logo_${randomUUID()}.${ext}`;
      const url = await params.uploader.upload({
        advertiserId: params.advertiserId,
        filename,
        pngBuffer: normalized.buffer,
        contentType: normalized.mime,
      });
      return {
        url,
        storagePath: `creatives/${params.advertiserId}/${filename}`,
        mime: normalized.mime,
        source: 'scraped',
      };
    } catch {
      continue;
    }
  }
  return null;
}
```

3. `storage.ts`: add `contentType?: 'image/png' | 'image/jpeg'` to the `upload` params in the interface and both implementations; `FirebaseCreativeUploader` uses it (default `'image/png'`) for both `contentType` fields it sets. (`pngBuffer` keeps its name to avoid touching every call site; the doc comment notes it may carry JPEG bytes for logos.)

4. `copy.ts`: `GenerateCreativeCopyParams` gains `uploader: CreativeUploader`; after `generateCopy` resolves:

```ts
const logo = await acquireScrapedLogo({
  advertiserId,
  candidates: ctx.logoCandidates,
  uploader,
});
```

and `logo` goes into the manifest object (`logo,` before `variants`). The route (`routes/creatives.ts`) already constructs an uploader for the render step — pass the same `chooseCreativeUploader()` result into `generateCreativeCopy` (add the argument at the call site; check how `/generate/render` obtains its uploader and mirror it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/ai-creative-logo.test.ts tests/ai-creative-extract-copy.test.ts"`
Expected: PASS (the extract/copy suite guards against regressions in `extractSiteContext`/`generateCreativeCopy` — update its `generateCreativeCopy` call sites for the new `uploader` param with `new StubCreativeUploader()`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/ai-creative/index.ts apps/api/src/services/ai-creative/logo.ts apps/api/src/services/ai-creative/storage.ts apps/api/src/services/ai-creative/copy.ts apps/api/tests/ai-creative-logo.test.ts apps/api/tests/ai-creative-extract-copy.test.ts
git commit -m "feat(api): scrape and store advertiser logo at the copy step"
```

---

### Task 3: Upload-override and skip endpoints

**Files:**

- Modify: `apps/api/src/routes/creatives.ts` (two new routes next to the other `/generate/*` routes, BEFORE the `:id` param route)
- Modify: `apps/api/src/lib/rate-limit.ts` (new `gen-logo` bucket, 20/day — copy the `gen-copy`/`gen-render` bucket pattern exactly)
- Test: `apps/api/tests/ai-creative-logo-route.test.ts` (new; follow `ai-creative-generate-route.test.ts`'s auth/emulator setup)

**Interfaces:**

- Consumes: `normalizeLogoBuffer` (Task 2), `getPreviewManifest`/`savePreviewManifest` (`previews.ts`), `chooseCreativeUploader`, `checkGenerationRateLimit`, `rejectApiKeyMutation`, `getAdvertiserByOwnerEmail` — all existing.
- Produces: `POST /v1/creatives/generate/logo` body `{ imageBase64: string, mime: 'image/png' | 'image/jpeg' | 'image/svg+xml' }` → updated manifest; `DELETE /v1/creatives/generate/logo` → updated manifest with `logo: null`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/ai-creative-logo-route.test.ts` with the same mocked-`verifyIdToken` + emulator setup as `ai-creative-generate-route.test.ts`, seeding an advertiser and a manifest (via the same helpers that suite uses — reuse its manifest-seeding approach; if it seeds through `/generate/copy`, do the same). Cases:

```ts
it('uploads a logo override onto the manifest', async () => {
  // seed advertiser + copy manifest first, then:
  const res = await app.request('/v1/creatives/generate/logo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ imageBase64: TINY_PNG_BASE64, mime: 'image/png' }),
  });
  expect(res.status).toBe(200);
  const manifest = await res.json();
  expect(manifest.logo).toMatchObject({ source: 'uploaded', mime: 'image/png' });
});

it('rejects an oversize payload with 400', async () => {
  const big = Buffer.alloc(1024 * 1024 + 1, 1).toString('base64');
  const res = await app.request('/v1/creatives/generate/logo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ imageBase64: big, mime: 'image/png' }),
  });
  expect(res.status).toBe(400);
});

it('rejects an undecodable svg with 400', async () => {
  const res = await app.request('/v1/creatives/generate/logo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    body: JSON.stringify({
      imageBase64: Buffer.from('<svg').toString('base64'),
      mime: 'image/svg+xml',
    }),
  });
  expect(res.status).toBe(400);
});

it('404s when no manifest exists yet', async () => {
  // fresh advertiser seeded, but NO /generate/copy call beforehand
  const res = await app.request('/v1/creatives/generate/logo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ imageBase64: TINY_PNG_BASE64, mime: 'image/png' }),
  });
  expect(res.status).toBe(404);
});

it('DELETE clears the logo (skip action)', async () => {
  // after a successful upload:
  const res = await app.request('/v1/creatives/generate/logo', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer valid-token' },
  });
  expect(res.status).toBe(200);
  expect((await res.json()).logo).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/ai-creative-logo-route.test.ts"`
Expected: FAIL with 404s from Hono (routes missing).

- [ ] **Step 3: Implement**

Body schema + routes in `routes/creatives.ts` (placed with the other `/generate/*` literals):

```ts
const UploadLogoBodySchema = z.object({
  imageBase64: z.string().min(1).max(1_400_000), // ~1MB after base64 inflation
  mime: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
});

creativesRouter.post('/generate/logo', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'upload creative logo');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');

  const { allowed } = await checkGenerationRateLimit('gen-logo', adv.id);
  if (!allowed) {
    throw new AppError(429, 'Hámarksfjöldi lógó-upphleðslna á dag er náður.', 'RATE_LIMITED');
  }

  const body = UploadLogoBodySchema.parse(await c.req.json());
  const raw = Buffer.from(body.imageBase64, 'base64');
  if (raw.length === 0 || raw.length > 1024 * 1024) {
    throw new AppError(400, 'Lógó má mest vera 1MB', 'BAD_REQUEST');
  }
  const normalized = normalizeLogoBuffer(raw, body.mime);
  if (!normalized) {
    throw new AppError(400, 'Ógild eða óstudd lógómynd', 'BAD_REQUEST');
  }

  const manifest = await getPreviewManifest(adv.id);
  if (!manifest) throw new AppError(404, 'No generation in progress', 'NOT_FOUND');

  const uploader = chooseCreativeUploader();
  const ext = normalized.mime === 'image/png' ? 'png' : 'jpg';
  const filename = `logo_${randomUUID()}.${ext}`;
  const url = await uploader.upload({
    advertiserId: adv.id,
    filename,
    pngBuffer: normalized.buffer,
    contentType: normalized.mime,
  });
  const updated = {
    ...manifest,
    logo: {
      url,
      storagePath: `creatives/${adv.id}/${filename}`,
      mime: normalized.mime,
      source: 'uploaded' as const,
    },
  };
  await savePreviewManifest(updated);
  return c.json(updated);
});

creativesRouter.delete('/generate/logo', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'remove creative logo');
  const adv = await getAdvertiserByOwnerEmail(user.email);
  if (!adv) throw new AppError(404, 'Advertiser profile not found', 'NOT_FOUND');
  const manifest = await getPreviewManifest(adv.id);
  if (!manifest) throw new AppError(404, 'No generation in progress', 'NOT_FOUND');
  const updated = { ...manifest, logo: null };
  await savePreviewManifest(updated);
  return c.json(updated);
});
```

Imports: `normalizeLogoBuffer` from the logo service, `randomUUID` from `node:crypto`; the rest already exist in the file. Add the `gen-logo` bucket (limit 20) to `lib/rate-limit.ts` following the existing bucket definitions verbatim.

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/ai-creative-logo-route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/creatives.ts apps/api/src/lib/rate-limit.ts apps/api/tests/ai-creative-logo-route.test.ts
git commit -m "feat(api): logo upload-override and skip endpoints for the creative wizard"
```

---

### Task 4: Composite the logo in templates and the render step

**Files:**

- Modify: `apps/api/src/services/ai-creative/templates.ts` (`RenderBannerInput` + both templates)
- Modify: `apps/api/src/services/ai-creative/storage.ts` (add `download` to `CreativeUploader`)
- Modify: `apps/api/src/services/ai-creative/render-variant.ts`
- Test: `apps/api/tests/ai-creative-templates.test.ts` (append)

**Interfaces:**

- Consumes: `manifest.logo` (Tasks 1-3), existing `backgroundPng` compositing pattern in `templates.ts:474-528`.
- Produces:

```ts
// templates.ts — RenderBannerInput gains:
logoPng?: Buffer | string | null;               // same Buffer-or-base64 contract as backgroundPng
logoMime?: 'image/png' | 'image/jpeg';          // data-URI mime; default 'image/png'

// storage.ts — CreativeUploader gains:
download(storagePath: string): Promise<Buffer>; // Firebase: bucket.file(path).download(); Stub: returns a fixed 1x1 PNG
```

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/tests/ai-creative-templates.test.ts` (reuse its existing `renderBannerSvg` fixture style):

```ts
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('logo compositing', () => {
  for (const templateId of ['bold', 'light'] as const) {
    it(`renders the logo chip in the ${templateId} template when logoPng is set`, () => {
      const svg = renderBannerSvg({ ...baseInput(), templateId, logoPng: TINY_PNG_B64 });
      expect(svg).toContain(`data:image/png;base64,${TINY_PNG_B64}`);
      expect(svg).toContain('class="logo-chip"');
    });

    it(`omits the logo entirely in ${templateId} when logoPng is null`, () => {
      const svg = renderBannerSvg({ ...baseInput(), templateId, logoPng: null });
      expect(svg).not.toContain('logo-chip');
    });
  }

  it('uses the jpeg mime in the data URI when logoMime says so', () => {
    const svg = renderBannerSvg({
      ...baseInput(),
      templateId: 'bold',
      logoPng: TINY_PNG_B64,
      logoMime: 'image/jpeg',
    });
    expect(svg).toContain('data:image/jpeg;base64,');
  });

  it('still renders a valid PNG through resvg with a logo present', () => {
    const svg = renderBannerSvg({ ...baseInput(), templateId: 'bold', logoPng: TINY_PNG_B64 });
    const png = renderSvgToPng(svg);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
});
```

(`baseInput()` = whatever minimal valid input helper the file already uses; add one if absent, using a 300x250 size.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/ai-creative-templates.test.ts"`
Expected: new tests FAIL (unknown input fields ignored, no `logo-chip` in output); existing tests PASS.

- [ ] **Step 3: Implement**

1. `templates.ts` — one shared helper, called by both templates near the end of their layer stack (above background/scrim, below nothing that would overlap it):

```ts
/** Fixed-position logo chip (2026-08-08 design): bottom-right in both
 * templates, white chip so contrast never depends on the logo's colors —
 * same philosophy as SCRIM for text. Height-driven box; extreme aspect
 * ratios cannot break the layout (preserveAspectRatio="meet"). */
function logoChipLayer(
  width: number,
  height: number,
  logoPngBase64: string,
  mime: 'image/png' | 'image/jpeg',
): string {
  const box = Math.round(Math.min(Math.max(height * 0.18, 20), 56));
  const maxW = Math.round(box * 2.5);
  const pad = Math.round(box * 0.15);
  const margin = Math.max(8, Math.round(width * 0.03));
  const chipW = maxW + pad * 2;
  const chipH = box + pad * 2;
  const x = width - margin - chipW;
  const y = height - margin - chipH;
  return `<g class="logo-chip">
    <rect x="${x}" y="${y}" width="${chipW}" height="${chipH}" rx="${Math.round(chipH * 0.18)}"
      fill="#ffffff" fill-opacity="0.94" stroke="#e2e8f0" stroke-width="1"/>
    <image href="data:${mime};base64,${logoPngBase64}" x="${x + pad}" y="${y + pad}"
      width="${maxW}" height="${box}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}
```

Wire-up mirroring `backgroundPng` exactly: normalize `input.logoPng` to base64 once (`typeof === 'string' ? as-is : toString('base64')`), compute `const logoLayer = logoPngBase64 ? logoChipLayer(width, height, logoPngBase64, input.logoMime ?? 'image/png') : '';` and interpolate `${logoLayer}` into BOTH templates' SVG bodies as the last layer before the closing `</svg>` (verify against each template's existing structure — text blocks sit in the upper/left regions in both, so a bottom-right chip does not collide; if a template's CTA button occupies the bottom-right at some size, place the chip bottom-LEFT for that template and assert accordingly — decide per template by reading the layout code, and keep the test's `logo-chip` class contract).

2. `storage.ts`:

```ts
// interface
download(storagePath: string): Promise<Buffer>;

// FirebaseCreativeUploader
async download(storagePath: string): Promise<Buffer> {
  const [buffer] = await storage.bucket().file(storagePath).download();
  return buffer;
}

// StubCreativeUploader — fixed tiny PNG so render tests can exercise the path
async download(): Promise<Buffer> {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
}
```

3. `render-variant.ts` — after the background block, once per variant render:

```ts
let logoPngBase64: string | null = null;
let logoMime: 'image/png' | 'image/jpeg' = 'image/png';
if (manifest.logo) {
  try {
    const logoBuffer = await uploader.download(manifest.logo.storagePath);
    logoPngBase64 = logoBuffer.toString('base64');
    logoMime = manifest.logo.mime;
  } catch (err) {
    // A missing logo is never worth a failed render (design §Error handling)
    console.warn('[render-variant] logo download failed, rendering without logo:', err);
  }
}
```

and pass `logoPng: logoPngBase64, logoMime` into `renderBannerSvg` (the `uploader` variable already exists in this function for image uploads — verify its name and reuse).

- [ ] **Step 4: Run tests to verify they pass**

Run: `firebase --config firebase/firebase.json emulators:exec "pnpm --filter @ada/api test -- tests/ai-creative-templates.test.ts tests/ai-creative-previews.test.ts tests/ai-creative-render-lazy-fonts.test.ts"`
Expected: PASS (the two extra suites cover render-variant regressions). Then `pnpm --filter @ada/api typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/ai-creative/templates.ts apps/api/src/services/ai-creative/storage.ts apps/api/src/services/ai-creative/render-variant.ts apps/api/tests/ai-creative-templates.test.ts
git commit -m "feat(api): composite advertiser logo onto generated banners"
```

---

### Task 5: Wizard UI — confirm / skip / upload in the Útlit step

**Files:**

- Modify: `apps/dashboard/src/components/CreativeGenerator.tsx` (the `wizardStep === 'utlit'` block, ~line 539)
- Test: `apps/dashboard/src/components/CreativeGenerator.test.tsx` (append)

**Interfaces:**

- Consumes: `manifest.logo` (`GeneratedPreviewManifest` from `@ada/shared` — rebuild shared first so the type exists), `POST`/`DELETE /v1/creatives/generate/logo` (Task 3).
- Produces: UI only.

- [ ] **Step 1: Write the failing tests**

Append to `CreativeGenerator.test.tsx`, following its existing mocked-`apiFetch` wizard-walkthrough helpers (it already walks to the Útlit step in some test — reuse that path; the copy-response fixture gains a `logo` field):

```tsx
const LOGO = {
  url: 'https://storage.example.test/creatives/adv_1/logo_x.png',
  storagePath: 'creatives/adv_1/logo_x.png',
  mime: 'image/png',
  source: 'scraped',
};

test('utlit step shows the scraped logo with skip and upload actions', async () => {
  // walk wizard to utlit with a manifest whose logo = LOGO
  expect(screen.getByAltText('Lógó auglýsanda')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Sleppa lógói' })).toBeDefined();
  expect(screen.getByLabelText('Hlaða upp eigin lógói')).toBeDefined();
});

test('skip calls DELETE and removes the logo preview', async () => {
  // mock DELETE /v1/creatives/generate/logo -> manifest with logo: null
  fireEvent.click(screen.getByRole('button', { name: 'Sleppa lógói' }));
  await vi.waitFor(() => {
    expect(screen.queryByAltText('Lógó auglýsanda')).toBeNull();
  });
});

test('utlit step without a logo shows only the upload affordance', async () => {
  // walk wizard with logo: null
  expect(screen.queryByAltText('Lógó auglýsanda')).toBeNull();
  expect(screen.getByLabelText('Hlaða upp eigin lógói')).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @ada/dashboard test -- CreativeGenerator`
Expected: new tests FAIL; existing PASS.

- [ ] **Step 3: Implement**

Inside the `utlit` step markup, above the template choice, add a logo panel (Icelandic copy, existing utility classes — match the step's current card/section styling):

```tsx
{
  /* Lógó — confirm / skip / upload (2026-08-08 design). The scraped logo is
    never rendered into a banner without being shown here first. */
}
<div className="space-y-2">
  <p className="text-xs font-semibold text-slate-700">Lógó í borðanum</p>
  {manifest?.logo ? (
    <div className="flex items-center gap-3">
      <img
        src={manifest.logo.url}
        alt="Lógó auglýsanda"
        className="h-10 w-auto max-w-[120px] rounded border border-slate-200 bg-white p-1 object-contain"
      />
      <Button type="button" variant="ghost" onClick={() => logoDeleteMutation.mutate()}>
        Sleppa lógói
      </Button>
    </div>
  ) : (
    <p className="text-xs text-slate-400">
      Ekkert lógó fannst á síðunni — þú getur hlaðið upp þínu eigin.
    </p>
  )}
  <label className="text-xs text-primary font-semibold cursor-pointer inline-block">
    Hlaða upp eigin lógói
    <input
      type="file"
      accept="image/png,image/jpeg,image/svg+xml"
      className="sr-only"
      aria-label="Hlaða upp eigin lógói"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) uploadLogoFile(file);
      }}
    />
  </label>
</div>;
```

with the mutations next to the existing ones:

```tsx
const logoDeleteMutation = useMutation({
  mutationFn: () =>
    apiFetch<GeneratedPreviewManifest>('/v1/creatives/generate/logo', { method: 'DELETE' }),
  onSuccess: (m) => setManifest(m),
  onError: () => setError('Ekki tókst að fjarlægja lógóið.'),
});

const logoUploadMutation = useMutation({
  mutationFn: (body: { imageBase64: string; mime: string }) =>
    apiFetch<GeneratedPreviewManifest>('/v1/creatives/generate/logo', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  onSuccess: (m) => setManifest(m),
  onError: () => setError('Ekki tókst að hlaða upp lógóinu. Hámark 1MB, PNG/JPEG/SVG.'),
});

function uploadLogoFile(file: File) {
  if (file.size > 1024 * 1024) {
    setError('Lógó má mest vera 1MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const imageBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    logoUploadMutation.mutate({ imageBase64, mime: file.type });
  };
  reader.readAsDataURL(file);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @ada/shared build && pnpm --filter @ada/dashboard test -- CreativeGenerator`
Expected: PASS. Then `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint`.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/CreativeGenerator.tsx apps/dashboard/src/components/CreativeGenerator.test.tsx
git commit -m "feat(dashboard): logo confirm/skip/upload in the creative wizard"
```

---

### Task 6: Verify, ship

- [ ] **Step 1: Full verify**

Run: `pnpm verify && pnpm test:api && pnpm --filter @ada/dashboard test`
Expected: all green. (One emulator invocation at a time.)

- [ ] **Step 2: Push branch and open PR**

Follow the oruggt-ship process (branch → PR → adversarial final review before push → owner merges). PR title: `feat: advertiser logo in generated creatives`. Body must note: manifest field is additive (old manifests read `logo` as absent), the format allowlist + 1MB cap, that acquisition is fully best-effort, and the manual acceptance criteria: (1) wizard shows the scraped logo in the Útlit step with skip/upload actions, (2) rendered banners carry the logo on a white chip bottom-right, (3) skipping renders banners exactly as today, (4) a site with no findable logo shows only the upload affordance.
