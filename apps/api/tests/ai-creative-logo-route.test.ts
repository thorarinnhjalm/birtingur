import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import type { DecodedIdToken } from 'firebase-admin/auth';

// Same rate-limit spy pattern as ai-creative-generate-route.test.ts — kept
// "always allowed" here since these tests aren't about the rate limiter
// itself, just proving /generate/logo consumes the independent `gen-logo`
// bucket.
const mockCheckGenerationRateLimit = vi.fn(async (_bucket: string, _advertiserId: string) => ({
  allowed: true,
  remaining: 19,
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

interface MockPreviewManifest {
  id: string;
  advertiserId: string;
  landingUrl: string;
  extract: { title: string; description: string; siteName: string; ogImage?: string };
  logo: { url: string; storagePath: string; mime: string; source: string } | null;
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
let mockPreviews: MockPreviewManifest[] = [];

vi.mock('../src/lib/firebase', () => {
  // Shared doc-ref factory (MINOR-6): `updatePreviewManifestLogo` calls
  // `db.doc('generated_previews/<id>')` directly (not
  // `db.collection(...).doc(...)`) for the field-level `.update()` — so this
  // mock's top-level `db.doc(path)` and `db.collection(colName).doc(id)`
  // both need to hand back the SAME shape, backed by the SAME in-memory
  // store, or the two call sites would silently diverge.
  function makeDocRef(colName: string, id: string) {
    const docGet = async () => {
      let data: Record<string, unknown> | null | undefined;
      if (colName === 'advertisers') {
        data = mockAdvertisers.find((a) => a.id === id) as unknown as Record<string, unknown>;
      } else if (colName === 'generated_previews') {
        data = mockPreviews.find((p) => p.id === id) as unknown as Record<string, unknown>;
      }
      return { exists: data != null, data: () => data };
    };
    const docSet = async (val: unknown) => {
      if (colName === 'advertisers') mockAdvertisers.push(val as MockAdvertiser);
      else if (colName === 'generated_previews') {
        mockPreviews = mockPreviews.filter((p) => p.id !== id);
        mockPreviews.push({ id, ...(val as Omit<MockPreviewManifest, 'id'>) });
      }
    };
    // Mirrors real Firestore: `.update()` on a nonexistent doc throws
    // (NOT_FOUND) — `updatePreviewManifestLogo` avoids relying on that by
    // checking existence first, but this still models the real behavior
    // faithfully in case a test exercises the raw path.
    const docUpdate = async (partial: Record<string, unknown>) => {
      if (colName === 'generated_previews') {
        const idx = mockPreviews.findIndex((p) => p.id === id);
        if (idx === -1) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
        mockPreviews[idx] = { ...mockPreviews[idx], ...partial } as MockPreviewManifest;
      } else if (colName === 'advertisers') {
        const idx = mockAdvertisers.findIndex((a) => a.id === id);
        if (idx === -1) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
        mockAdvertisers[idx] = { ...mockAdvertisers[idx], ...partial } as MockAdvertiser;
      }
    };
    return {
      id,
      get: vi.fn(docGet),
      set: vi.fn(docSet),
      update: vi.fn(docUpdate),
      withConverter: vi.fn(() => ({
        get: vi.fn(docGet),
        set: vi.fn(docSet),
        update: vi.fn(docUpdate),
      })),
    };
  }

  return {
    auth: { verifyIdToken: vi.fn() },
    db: {
      collection: vi.fn((colName: string) => ({
        doc: vi.fn((id: string) => makeDocRef(colName, id)),
        where: vi.fn((prop: string, _op: string, val: unknown) => {
          const runQuery = async () => {
            let list: Record<string, unknown>[] = [];
            if (colName === 'advertisers')
              list = mockAdvertisers as unknown as Record<string, unknown>[];
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
      // `db.doc('collection/id')` shorthand — used by
      // updatePreviewManifestLogo's raw (non-converter) update ref.
      doc: vi.fn((path: string) => {
        const idx = path.lastIndexOf('/');
        return makeDocRef(path.slice(0, idx), path.slice(idx + 1));
      }),
    },
    storage: {},
  };
});

// 1x1 transparent PNG (same fixture ai-creative-logo.test.ts uses)
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const FIXTURE_HTML = `<html><head><title>Blómabúð Vesturbæjar</title>
<meta name="description" content="Ferskir blómvendir sendir samdægurs."></head><body></body></html>`;

const authHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' };

describe('AI creative logo upload-override and skip routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckGenerationRateLimit.mockClear();
    mockCheckGenerationRateLimit.mockResolvedValue({ allowed: true, remaining: 19 });
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

  async function seedCopyManifest() {
    const res = await app.request('/v1/creatives/generate/copy', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ landingUrl: 'https://93.184.216.34/', variants: 1 }),
    });
    return res.json();
  }

  it('uploads a logo override onto the manifest', async () => {
    await seedCopyManifest();
    const res = await app.request('/v1/creatives/generate/logo', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageBase64: TINY_PNG_BASE64, mime: 'image/png' }),
    });
    expect(res.status).toBe(200);
    const manifest = await res.json();
    expect(manifest.logo).toMatchObject({ source: 'uploaded', mime: 'image/png' });
  });

  it('rejects an oversize payload with 400', async () => {
    await seedCopyManifest();
    const big = Buffer.alloc(1024 * 1024 + 1, 1).toString('base64');
    const res = await app.request('/v1/creatives/generate/logo', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageBase64: big, mime: 'image/png' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an undecodable svg with 400', async () => {
    await seedCopyManifest();
    const res = await app.request('/v1/creatives/generate/logo', {
      method: 'POST',
      headers: authHeaders,
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
      headers: authHeaders,
      body: JSON.stringify({ imageBase64: TINY_PNG_BASE64, mime: 'image/png' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE clears the logo (skip action)', async () => {
    await seedCopyManifest();
    await app.request('/v1/creatives/generate/logo', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageBase64: TINY_PNG_BASE64, mime: 'image/png' }),
    });
    const res = await app.request('/v1/creatives/generate/logo', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).logo).toBeNull();
  });

  it('consumes the gen-logo bucket', async () => {
    await seedCopyManifest();
    mockCheckGenerationRateLimit.mockClear();
    const res = await app.request('/v1/creatives/generate/logo', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageBase64: TINY_PNG_BASE64, mime: 'image/png' }),
    });
    expect(res.status).toBe(200);
    expect(mockCheckGenerationRateLimit).toHaveBeenCalledTimes(1);
    expect(mockCheckGenerationRateLimit).toHaveBeenCalledWith('gen-logo', 'adv_gen1');
  });

  // MINOR-5 (adversarial review): Zod body validation must run BEFORE the
  // gen-logo rate-limit check, so a malformed body is rejected for free
  // without consuming a quota slot.
  it('rejects a malformed body with 400 before touching the rate limiter', async () => {
    await seedCopyManifest();
    mockCheckGenerationRateLimit.mockClear();
    const res = await app.request('/v1/creatives/generate/logo', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageBase64: '', mime: 'image/png' }), // fails min(1)
    });
    expect(res.status).toBe(400);
    expect(mockCheckGenerationRateLimit).not.toHaveBeenCalled();
  });

  it('404s DELETE when no manifest exists yet', async () => {
    const res = await app.request('/v1/creatives/generate/logo', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(404);
  });
});
