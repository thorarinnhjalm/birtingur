import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { IAB_STANDARD_SIZES } from '@ada/shared';

// Fix 2 (adversarial review): spy on the rate limiter to prove the route
// checks the SSRF-guarded landing-page extraction BEFORE consuming one of
// the advertiser's 10 daily generation slots — an invalid/unsafe URL is a
// bad client input, not a real attempt, and shouldn't cost them a slot.
const mockCheckGenerationRateLimit = vi.fn(async (_advertiserId: string) => ({
  allowed: true,
  remaining: 9,
}));
vi.mock('../src/lib/rate-limit', () => ({
  checkGenerationRateLimit: (advertiserId: string) => mockCheckGenerationRateLimit(advertiserId),
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
  createdAt: Date;
  variants: Array<{
    variantId: string;
    copy: { headline: string; subline: string; cta: string };
    images: Array<{ sizeKey: string; width: number; height: number; url: string }>;
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

describe('AI creative generation routes', () => {
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

  describe('POST /v1/creatives/generate', () => {
    it('generates preview variants across every IAB size and persists the manifest', async () => {
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/', variants: 2 }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.variants).toHaveLength(2);
      for (const variant of body.variants) {
        expect(variant.images).toHaveLength(IAB_STANDARD_SIZES.length);
        for (const image of variant.images) {
          expect(image.url).toMatch(/^https:\/\/storage\.example\.test\//);
        }
        expect(variant.copy.headline.length).toBeGreaterThan(0);
      }
      expect(mockPreviews).toHaveLength(1);
      expect(mockPreviews[0]?.advertiserId).toBe('adv_gen1');
    });

    it('defaults to 2 variants when not specified', async () => {
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.variants).toHaveLength(2);
    });

    it('rejects an SSRF-unsafe landing URL with 400, not 500', async () => {
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'https://127.0.0.1/admin' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects a plain http:// landing URL', async () => {
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'http://93.184.216.34/' }),
      });
      expect(res.status).toBe(400);
    });

    // Fix 2 (adversarial review): the SSRF-guarded extraction must run BEFORE
    // the rate limiter is consulted, so a bad/unsafe URL never burns one of
    // the advertiser's 10 daily generation slots.
    it('does not consume a rate-limit slot when the landing URL is SSRF-unsafe', async () => {
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'https://127.0.0.1/admin' }),
      });
      expect(res.status).toBe(400);
      expect(mockCheckGenerationRateLimit).not.toHaveBeenCalled();
    });

    it('does consume a rate-limit slot for a valid, safe landing URL', async () => {
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(201);
      expect(mockCheckGenerationRateLimit).toHaveBeenCalledTimes(1);
    });

    it('404s when the caller has no advertiser profile', async () => {
      mockAdvertisers = [];
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/creatives/generate/confirm', () => {
    async function generate(variants = 2) {
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/', variants }),
      });
      return res.json();
    }

    it('404s if nothing was generated yet', async () => {
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({
          variantId: 'gen_doesnotexist',
          landingUrl: 'https://93.184.216.34/',
        }),
      });
      expect(res.status).toBe(404);
    });

    it('creates one Creative per size for the confirmed variant, carrying the copy into ocrTextHint', async () => {
      const manifest = await generate(2);
      const variantId = manifest.variants[0].variantId;

      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ variantId, landingUrl: 'https://93.184.216.34/vara' }),
      });

      expect(res.status).toBe(201);
      const created = await res.json();
      expect(created).toHaveLength(IAB_STANDARD_SIZES.length);
      for (const creative of created) {
        // Fix 5 (adversarial review): clickUrl always comes from
        // manifest.landingUrl (the SSRF-validated URL fetched at generate
        // time), never the confirm body's caller-supplied landingUrl — see
        // the next test for the mismatched-URL case this guards against.
        expect(creative.clickUrl).toBe(manifest.landingUrl);
        expect(creative.advertiserId).toBe('adv_gen1');
        expect(creative.ocrTextHint).toContain(manifest.variants[0].copy.headline);
      }
      expect(mockCreatives).toHaveLength(IAB_STANDARD_SIZES.length);
    });

    it('ignores a mismatched landingUrl in the confirm body — creatives still point at the manifest URL', async () => {
      const manifest = await generate(1);
      const variantId = manifest.variants[0].variantId;

      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
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
      await generate(1);
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ variantId: 'gen_bogus', landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(404);
    });

    it('confirms an explicit subset of image URLs instead of a whole variant', async () => {
      const manifest = await generate(1);
      const firstImageUrl = manifest.variants[0].images[0].url;

      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ imageUrls: [firstImageUrl], landingUrl: 'https://93.184.216.34/' }),
      });

      expect(res.status).toBe(201);
      const created = await res.json();
      expect(created).toHaveLength(1);
      expect(created[0].imageUrl).toBe(firstImageUrl);
    });

    it("rejects an image URL that does not belong to the advertiser's manifest", async () => {
      await generate(1);
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({
          imageUrls: ['https://storage.example.test/creatives/other-advertiser/gen-x.png'],
          landingUrl: 'https://93.184.216.34/',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects a body with neither variantId nor imageUrls', async () => {
      await generate(1);
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify({ landingUrl: 'https://93.184.216.34/' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
