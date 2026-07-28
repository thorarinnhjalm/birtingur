import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import type { DecodedIdToken } from 'firebase-admin/auth';

// Fix 12 (adversarial review — supersedes the old Fix 2 ordering): spy on
// the rate limiter to prove /generate/copy checks the rate limit BEFORE the
// SSRF-guarded landing-page extraction (so an over-quota caller can no
// longer drive unbounded outbound fetches/DNS lookups — see routes/
// creatives.ts's Fix 12 comment), while a syntactically-invalid URL (caught
// by Zod before either check runs) still never touches the rate limiter.
// Also proves /generate/copy and /generate/render consume INDEPENDENT
// buckets (creative-wizard, 2026-07-27 plan's rate-limit split).
const mockCheckGenerationRateLimit = vi.fn(async (_bucket: string, _advertiserId: string) => ({
  allowed: true,
  remaining: 9,
}));
vi.mock('../src/lib/rate-limit', () => ({
  checkGenerationRateLimit: (bucket: string, advertiserId: string) =>
    mockCheckGenerationRateLimit(bucket, advertiserId),
}));

interface MockAdvertiser {
  id: string;
  ownerEmail: string;
  companyName: string;
  kennitala: string;
  vatNumber: string;
  walletBalanceIsk: number;
  status: string;
  createdAt: Date;
}

interface MockCreative {
  id: string;
  advertiserId: string;
  imageUrl: string;
  width: number;
  height: number;
  clickUrl: string;
  ocrTextHint?: string;
  reviewStatus: string;
  reviewLog: Array<{ at: Date; by: string; action: string; reason?: string }>;
}

interface MockPreviewManifest {
  id: string;
  advertiserId: string;
  landingUrl: string;
  extract: { title: string; description: string; siteName: string; ogImage?: string };
  createdAt: Date;
  status: 'copy' | 'rendered';
  variants: Array<{
    variantId: string;
    copy: { headline: string; subline: string; cta: string };
    images: Array<{ sizeKey: string; width: number; height: number; url: string }>;
    templateId?: string;
    edited?: boolean;
  }>;
}

let mockAdvertisers: MockAdvertiser[] = [];
let mockCreatives: MockCreative[] = [];
let mockPreviews: MockPreviewManifest[] = [];

vi.mock('../src/lib/firebase', () => ({
  auth: { verifyIdToken: vi.fn() },
  db: {
    collection: vi.fn((colName: string) => ({
      doc: vi.fn((id: string) => {
        const docGet = async () => {
          let data: Record<string, unknown> | null | undefined;
          if (colName === 'advertisers') {
            data = mockAdvertisers.find((a) => a.id === id) as unknown as Record<string, unknown>;
          } else if (colName === 'creatives') {
            data = mockCreatives.find((c) => c.id === id) as unknown as Record<string, unknown>;
          } else if (colName === 'generated_previews') {
            data = mockPreviews.find((p) => p.id === id) as unknown as Record<string, unknown>;
          }
          return { exists: data != null, data: () => data };
        };
        const docSet = async (val: unknown) => {
          if (colName === 'advertisers') mockAdvertisers.push(val as MockAdvertiser);
          else if (colName === 'creatives') mockCreatives.push(val as MockCreative);
          else if (colName === 'generated_previews') {
            mockPreviews = mockPreviews.filter((p) => p.id !== id);
            mockPreviews.push({ id, ...(val as Omit<MockPreviewManifest, 'id'>) });
          }
        };
        return {
          id,
          get: vi.fn(docGet),
          set: vi.fn(docSet),
          withConverter: vi.fn(() => ({ get: vi.fn(docGet), set: vi.fn(docSet) })),
        };
      }),
      where: vi.fn((prop: string, _op: string, val: unknown) => {
        const runQuery = async () => {
          let list: Record<string, unknown>[] = [];
          if (colName === 'advertisers')
            list = mockAdvertisers as unknown as Record<string, unknown>[];
          else if (colName === 'creatives')
            list = mockCreatives as unknown as Record<string, unknown>[];
          const filtered = list.filter((item) => item[prop] === val);
          return {
            empty: filtered.length === 0,
            docs: filtered.map((item) => ({ data: () => item })),
          };
        };
        const builder: any = {
          where: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          get: vi.fn(runQuery),
          withConverter: vi.fn(() => ({ get: vi.fn(runQuery) })),
        };
        return builder;
      }),
      get: vi.fn(async () => ({ docs: [] })),
    })),
  },
  storage: {},
}));

const FIXTURE_HTML = `<html><head><title>Blómabúð Vesturbæjar</title>
<meta name="description" content="Ferskir blómvendir sendir samdægurs."></head><body></body></html>`;

const authHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' };

describe('AI creative generation routes (split copy/render flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckGenerationRateLimit.mockClear();
    mockCheckGenerationRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
    mockAdvertisers = [
      {
        id: 'adv_gen1',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blómabúð Vesturbæjar',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 100000,
        status: 'active',
        createdAt: new Date(),
      },
    ];
    mockCreatives = [];
    mockPreviews = [];

    vi.mocked(auth.verifyIdToken).mockResolvedValue({
      uid: 'user-123',
      email: 'advertiser@example.is',
      email_verified: true,
    } as unknown as DecodedIdToken);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FIXTURE_HTML, { headers: { 'content-type': 'text/html' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function generateCopy(variants = 2) {
    const res = await app.request('/v1/creatives/generate/copy', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ landingUrl: 'https://93.184.216.34/', variants }),
    });
    return res.json();
  }

  describe('POST /v1/creatives/generate/copy', () => {
    it('generates copy variants only and persists a status:"copy" manifest with empty images', async () => {
      const res = await app.request('/v1/creatives/generate/copy', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/', variants: 2 }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe('copy');
      expect(body.variants).toHaveLength(2);
      for (const variant of body.variants) {
        expect(variant.images).toHaveLength(0);
        expect(variant.copy.headline.length).toBeGreaterThan(0);
      }
      expect(mockPreviews).toHaveLength(1);
      expect(mockPreviews[0]?.advertiserId).toBe('adv_gen1');
    });

    it('defaults to 3 variants when not specified', async () => {
      const res = await app.request('/v1/creatives/generate/copy', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.variants).toHaveLength(3);
    });

    it('rejects an SSRF-unsafe landing URL with 400, not 500', async () => {
      const res = await app.request('/v1/creatives/generate/copy', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'https://127.0.0.1/admin' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects a plain http:// landing URL', async () => {
      const res = await app.request('/v1/creatives/generate/copy', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'http://93.184.216.34/' }),
      });
      expect(res.status).toBe(400);
    });

    // Fix 12 (adversarial review): this expectation is INTENTIONALLY the
    // opposite of what it used to be. The rate limit now runs BEFORE the
    // SSRF-guarded fetch (see routes/creatives.ts's Fix 12 comment), so a
    // syntactically-valid-but-SSRF-unsafe URL like this one DOES consume a
    // gen-copy slot on its way to the 400 — the cost of closing the bigger
    // hole where an over-quota caller could drive unlimited outbound
    // DNS/fetch attempts by always failing before the 429 was ever reached.
    it('consumes a rate-limit slot even when the landing URL is SSRF-unsafe (rate limit now checked before the SSRF-guarded fetch)', async () => {
      const res = await app.request('/v1/creatives/generate/copy', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'https://127.0.0.1/admin' }),
      });
      expect(res.status).toBe(400);
      expect(mockCheckGenerationRateLimit).toHaveBeenCalledTimes(1);
      expect(mockCheckGenerationRateLimit).toHaveBeenCalledWith('gen-copy', 'adv_gen1');
    });

    // NEW test (not one of the two updated expectations — this demonstrates
    // the actual security fix Fix 12 is for): proves an over-quota caller's
    // request is rejected before the SSRF-guarded fetch (with its DNS
    // lookup) ever runs, closing the unbounded-outbound-request gap.
    it('429s (without ever attempting the SSRF-guarded fetch) once the daily gen-copy limit is exceeded', async () => {
      mockCheckGenerationRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
      const fetchSpy = vi.mocked(globalThis.fetch);
      const res = await app.request('/v1/creatives/generate/copy', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(429);
      // The SSRF guard's DNS lookup happens inside extractSiteContext, which
      // itself calls fetch() only after resolving — asserting fetch was
      // never invoked proves the 429 short-circuited before any outbound
      // network activity, which is the whole point of Fix 12's reorder.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('consumes the gen-copy bucket (not gen-render) for a valid, safe landing URL', async () => {
      const res = await app.request('/v1/creatives/generate/copy', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(201);
      expect(mockCheckGenerationRateLimit).toHaveBeenCalledTimes(1);
      expect(mockCheckGenerationRateLimit).toHaveBeenCalledWith('gen-copy', 'adv_gen1');
    });

    it('404s when the caller has no advertiser profile', async () => {
      mockAdvertisers = [];
      const res = await app.request('/v1/creatives/generate/copy', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/creatives/generate/render', () => {
    it('404s if no copy manifest exists yet', async () => {
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId: 'gen_x',
          sizes: [{ width: 300, height: 250 }],
          templateId: 'bold',
        }),
      });
      expect(res.status).toBe(404);
    });

    it('404s on an unknown variantId', async () => {
      await generateCopy(1);
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId: 'gen_bogus',
          sizes: [{ width: 300, height: 250 }],
          templateId: 'bold',
        }),
      });
      expect(res.status).toBe(404);
    });

    it('does not consume a rate-limit slot for an unknown variantId', async () => {
      await generateCopy(1);
      mockCheckGenerationRateLimit.mockClear();
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId: 'gen_bogus',
          sizes: [{ width: 300, height: 250 }],
          templateId: 'bold',
        }),
      });
      expect(res.status).toBe(404);
      expect(mockCheckGenerationRateLimit).not.toHaveBeenCalled();
    });

    it('rejects a size that is not in the IAB standard list', async () => {
      const manifest = await generateCopy(1);
      const variantId = manifest.variants[0].variantId;
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId,
          sizes: [{ width: 999, height: 999 }],
          templateId: 'bold',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects editedCopy that exceeds the schema length caps', async () => {
      const manifest = await generateCopy(1);
      const variantId = manifest.variants[0].variantId;
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId,
          editedCopy: { headline: 'x'.repeat(31), subline: 'ok', cta: 'ok' },
          sizes: [{ width: 300, height: 250 }],
          templateId: 'bold',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('renders ONLY the requested sizes, uploads them, and flips status to "rendered"', async () => {
      const manifest = await generateCopy(1);
      const variantId = manifest.variants[0].variantId;
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId,
          sizes: [
            { width: 300, height: 250 },
            { width: 728, height: 90 },
          ],
          templateId: 'light',
        }),
      });
      expect(res.status).toBe(201);
      const updated = await res.json();
      expect(updated.status).toBe('rendered');
      const variant = updated.variants.find(
        (v: { variantId: string }) => v.variantId === variantId,
      );
      expect(variant.images).toHaveLength(2);
      const sizeKeys = variant.images.map((i: { sizeKey: string }) => i.sizeKey).sort();
      expect(sizeKeys).toEqual(['300x250', '728x90']);
      expect(variant.templateId).toBe('light');
      expect(variant.edited).toBeFalsy();
      for (const image of variant.images) {
        expect(image.url).toMatch(/^https:\/\/storage\.example\.test\//);
      }
    });

    it('replaces the variant copy and marks edited:true when editedCopy is supplied', async () => {
      const manifest = await generateCopy(1);
      const variantId = manifest.variants[0].variantId;
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId,
          editedCopy: { headline: 'Nýr titill', subline: 'Ný undirsetning', cta: 'Kaupa' },
          sizes: [{ width: 300, height: 250 }],
          templateId: 'bold',
        }),
      });
      expect(res.status).toBe(201);
      const updated = await res.json();
      const variant = updated.variants.find(
        (v: { variantId: string }) => v.variantId === variantId,
      );
      expect(variant.copy).toEqual({
        headline: 'Nýr titill',
        subline: 'Ný undirsetning',
        cta: 'Kaupa',
      });
      expect(variant.edited).toBe(true);
    });

    it('does NOT mark edited when editedCopy is omitted (original copy kept)', async () => {
      const manifest = await generateCopy(1);
      const variantId = manifest.variants[0].variantId;
      const originalCopy = manifest.variants[0].copy;
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId,
          sizes: [{ width: 300, height: 250 }],
          templateId: 'bold',
        }),
      });
      const updated = await res.json();
      const variant = updated.variants.find(
        (v: { variantId: string }) => v.variantId === variantId,
      );
      expect(variant.copy).toEqual(originalCopy);
      expect(variant.edited).toBeFalsy();
    });

    it('consumes the gen-render bucket (not gen-copy)', async () => {
      const manifest = await generateCopy(1);
      const variantId = manifest.variants[0].variantId;
      mockCheckGenerationRateLimit.mockClear();
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId,
          sizes: [{ width: 300, height: 250 }],
          templateId: 'bold',
        }),
      });
      expect(res.status).toBe(201);
      expect(mockCheckGenerationRateLimit).toHaveBeenCalledTimes(1);
      expect(mockCheckGenerationRateLimit).toHaveBeenCalledWith('gen-render', 'adv_gen1');
    });
  });

  describe('POST /v1/creatives/generate/confirm', () => {
    async function generateAndRender(
      sizes: Array<{ width: number; height: number }> = [{ width: 300, height: 250 }],
      variants = 1,
    ) {
      const manifest = await generateCopy(variants);
      const variantId = manifest.variants[0].variantId;
      const res = await app.request('/v1/creatives/generate/render', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ variantId, sizes, templateId: 'bold' }),
      });
      return res.json();
    }

    it('404s if nothing was generated yet', async () => {
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId: 'gen_doesnotexist',
          landingUrl: 'https://93.184.216.34/',
        }),
      });
      expect(res.status).toBe(404);
    });

    it('400s confirming a variant that has copy but was never rendered', async () => {
      const manifest = await generateCopy(1);
      const variantId = manifest.variants[0].variantId;
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ variantId, landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(400);
    });

    it('creates one Creative per rendered size for the confirmed variant, carrying the copy into ocrTextHint', async () => {
      const manifest = await generateAndRender([
        { width: 300, height: 250 },
        { width: 728, height: 90 },
      ]);
      const variantId = manifest.variants[0].variantId;

      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ variantId, landingUrl: 'https://93.184.216.34/vara' }),
      });

      expect(res.status).toBe(201);
      const created = await res.json();
      expect(created).toHaveLength(2);
      for (const creative of created) {
        // Fix 5 (adversarial review): clickUrl always comes from
        // manifest.landingUrl (the SSRF-validated URL fetched at copy time),
        // never the confirm body's caller-supplied landingUrl.
        expect(creative.clickUrl).toBe(manifest.landingUrl);
        expect(creative.advertiserId).toBe('adv_gen1');
        expect(creative.ocrTextHint).toContain(manifest.variants[0].copy.headline);
      }
      expect(mockCreatives).toHaveLength(2);
    });

    it('ignores a mismatched landingUrl in the confirm body — creatives still point at the manifest URL', async () => {
      const manifest = await generateAndRender();
      const variantId = manifest.variants[0].variantId;

      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          variantId,
          landingUrl: 'https://attacker-controlled.example.is/phish',
        }),
      });

      expect(res.status).toBe(201);
      const created = await res.json();
      for (const creative of created) {
        expect(creative.clickUrl).toBe(manifest.landingUrl);
        expect(creative.clickUrl).not.toBe('https://attacker-controlled.example.is/phish');
      }
    });

    it('404s on an unknown variantId', async () => {
      await generateAndRender();
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ variantId: 'gen_bogus', landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(404);
    });

    it('confirms an explicit subset of image URLs instead of a whole variant', async () => {
      const manifest = await generateAndRender();
      const firstImageUrl = manifest.variants[0].images[0].url;

      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ imageUrls: [firstImageUrl], landingUrl: 'https://93.184.216.34/' }),
      });

      expect(res.status).toBe(201);
      const created = await res.json();
      expect(created).toHaveLength(1);
      expect(created[0].imageUrl).toBe(firstImageUrl);
    });

    it("rejects an image URL that does not belong to the advertiser's manifest", async () => {
      await generateAndRender();
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          imageUrls: ['https://storage.example.test/creatives/other-advertiser/gen-x.png'],
          landingUrl: 'https://93.184.216.34/',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects a body with neither variantId nor imageUrls', async () => {
      await generateAndRender();
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
