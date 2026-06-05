import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import type { DecodedIdToken } from 'firebase-admin/auth';

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
  reviewStatus: string;
  reviewLog: Array<{
    at: Date;
    by: string;
    action: string;
    reason?: string;
  }>;
}

interface MockCampaign {
  id: string;
  advertiserId: string;
  creativeIds: string[];
  targeting: {
    categories: string[];
  };
  schedule: {
    startsAt: Date;
    endsAt: Date;
  };
  budget: {
    mode: 'cpm_capped' | 'slot_purchased';
    totalIsk: number;
    remainingIsk: number;
  };
  status: string;
}

interface MockPublisher {
  id: string;
  ownerEmail: string;
  domain: string;
  displayName: string;
  status: string;
  contentPolicy: {
    blockedCategories: string[];
    requireManualApproval: boolean;
  };
}

interface MockSlot {
  id: string;
  publisherId: string;
  name: string;
  sizes: Array<{ width: number; height: number }>;
  pricing: {
    mode: 'cpm' | 'slot';
    cpmIsk?: number;
    slotPriceIsk?: number;
    slotPeriodDays?: number;
  };
  placement: {
    pageMatcher: string;
    position: string;
  };
  status: string;
}

let mockAdvertisers: MockAdvertiser[] = [];
let mockCreatives: MockCreative[] = [];
let mockCampaigns: MockCampaign[] = [];
let mockPublishers: MockPublisher[] = [];
let mockSlots: MockSlot[] = [];

vi.mock('../src/lib/firebase', () => ({
  auth: {
    verifyIdToken: vi.fn(),
  },
  db: {
    collection: vi.fn((colName: string) => ({
      doc: vi.fn((id: string) => {
        const docGet = async () => {
          let data: Record<string, unknown> | null = null;
          if (colName === 'advertisers') {
            data =
              (mockAdvertisers.find((a) => a.id === id) as unknown as Record<string, unknown>) ||
              null;
          } else if (colName === 'creatives') {
            data =
              (mockCreatives.find((c) => c.id === id) as unknown as Record<string, unknown>) ||
              null;
          } else if (colName === 'campaigns') {
            data =
              (mockCampaigns.find((c) => c.id === id) as unknown as Record<string, unknown>) ||
              null;
          } else if (colName === 'publishers') {
            data =
              (mockPublishers.find((p) => p.id === id) as unknown as Record<string, unknown>) ||
              null;
          } else if (colName === 'slots') {
            data =
              (mockSlots.find((s) => s.id === id) as unknown as Record<string, unknown>) || null;
          }
          return {
            exists: data !== undefined && data !== null,
            data: () => data,
          };
        };
        const docSet = async (val: unknown) => {
          if (colName === 'advertisers') {
            mockAdvertisers.push(val as MockAdvertiser);
          } else if (colName === 'creatives') {
            mockCreatives.push(val as MockCreative);
          } else if (colName === 'campaigns') {
            mockCampaigns.push(val as MockCampaign);
          }
        };
        // Mirror the real DocumentReference: `.get()`/`.set()` are available
        // directly and after `.withConverter()`. Without the direct methods,
        // source paths that call `.doc().set()` without a converter throw
        // "set is not a function".
        return {
          id,
          get: vi.fn(docGet),
          set: vi.fn(docSet),
          withConverter: vi.fn(() => ({
            get: vi.fn(docGet),
            set: vi.fn(docSet),
          })),
        };
      }),
      where: vi.fn((prop: string, _op: string, val: unknown) => {
        const runQuery = async () => {
          let list: Record<string, unknown>[] = [];
          if (colName === 'advertisers') {
            list = mockAdvertisers as unknown as Record<string, unknown>[];
          } else if (colName === 'creatives') {
            list = mockCreatives as unknown as Record<string, unknown>[];
          } else if (colName === 'campaigns') {
            list = mockCampaigns as unknown as Record<string, unknown>[];
          } else if (colName === 'slots') {
            list = mockSlots as unknown as Record<string, unknown>[];
          }
          const filtered = list.filter((item) => item[prop] === val);
          return {
            empty: filtered.length === 0,
            docs: filtered.map((item) => ({
              data: () => item,
            })),
          };
        };
        // Mirror the real Firestore Query: `.get()` is available directly on the
        // query (with or without `.withConverter()`), and `.where()`/`.limit()`
        // are chainable. Without the direct `.get`, source paths that call
        // `.where().limit().get()` without a converter throw "get is not a function".
        const builder: any = {
          where: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          get: vi.fn(runQuery),
          withConverter: vi.fn(() => ({
            get: vi.fn(runQuery),
          })),
        };
        return builder;
      }),
    })),
  },
  storage: {},
}));

describe('Advertiser HTTP Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdvertisers = [];
    mockCreatives = [];
    mockCampaigns = [];
    mockPublishers = [];
    mockSlots = [];

    // Default authorized user
    vi.mocked(auth.verifyIdToken).mockResolvedValue({
      uid: 'user-123',
      email: 'advertiser@example.is',
    } as unknown as DecodedIdToken);
  });

  describe('POST /v1/advertisers', () => {
    it('creates advertiser profile', async () => {
      const res = await app.request('/v1/advertisers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          companyName: 'Blóm og lauf',
          kennitala: '5555555555',
          vatNumber: '98765',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.companyName).toBe('Blóm og lauf');
      expect(body.walletBalanceIsk).toBe(0);
    });
  });

  describe('GET /v1/advertisers/me', () => {
    it('returns the profile if it exists', async () => {
      mockAdvertisers.push({
        id: 'adv_123',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blóm og lauf',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 0,
        status: 'active',
        createdAt: new Date(),
      });

      const res = await app.request('/v1/advertisers/me', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('adv_123');
    });

    it('returns 404 if profile is missing', async () => {
      const res = await app.request('/v1/advertisers/me', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/creatives', () => {
    it('creates creative', async () => {
      mockAdvertisers.push({
        id: 'adv_123',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blóm og lauf',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 0,
        status: 'active',
        createdAt: new Date(),
      });

      const res = await app.request('/v1/creatives', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          imageUrl: 'https://ex.com/a.png',
          width: 300,
          height: 250,
          clickUrl: 'https://ex.com',
          ocrTextHint: 'Kauptu blóm',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toMatch(/^crt_[a-f0-9]{24}$/);
      expect(body.reviewStatus).toBe('auto_approved');
    });
  });

  describe('POST /v1/campaigns', () => {
    it('creates campaign', async () => {
      mockAdvertisers.push({
        id: 'adv_123',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blóm og lauf',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 0,
        status: 'active',
        createdAt: new Date(),
      });

      mockCreatives.push({
        id: 'crt_123',
        advertiserId: 'adv_123',
        imageUrl: 'https://ex.com/a.png',
        width: 728,
        height: 90,
        clickUrl: 'https://ex.com',
        reviewStatus: 'auto_approved',
        reviewLog: [],
      });

      mockPublishers.push({
        id: 'pub_123',
        ownerEmail: 'p@p.is',
        domain: 'p.is',
        displayName: 'P',
        status: 'active',
        contentPolicy: { blockedCategories: [], requireManualApproval: false },
      });

      mockSlots.push({
        id: 'slot_123',
        publisherId: 'pub_123',
        name: 'A',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1500 },
        placement: { pageMatcher: '/', position: 'above_fold' },
        status: 'active',
      });

      const res = await app.request('/v1/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          creativeIds: ['crt_123'],
          categories: ['matur'],
          schedule: {
            startsAt: new Date(Date.now() + 1000).toISOString(),
            endsAt: new Date(Date.now() + 86400_000).toISOString(),
          },
          budget: { mode: 'cpm_capped', totalIsk: 10000 },
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toMatch(/^cmp_[a-f0-9]{24}$/);
      expect(body.status).toBe('active');
    });
  });

  describe('GET /v1/creatives', () => {
    it('lists creatives for the advertiser', async () => {
      mockAdvertisers.push({
        id: 'adv_123',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blóm og lauf',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 0,
        status: 'active',
        createdAt: new Date(),
      });
      mockCreatives.push({
        id: 'crt_123',
        advertiserId: 'adv_123',
        imageUrl: 'https://ex.com/a.png',
        width: 728,
        height: 90,
        clickUrl: 'https://ex.com',
        reviewStatus: 'auto_approved',
        reviewLog: [],
      });

      const res = await app.request('/v1/creatives', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe('crt_123');
    });
  });

  describe('GET /v1/creatives/:id', () => {
    it('returns the requested creative', async () => {
      mockAdvertisers.push({
        id: 'adv_123',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blóm og lauf',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 0,
        status: 'active',
        createdAt: new Date(),
      });
      mockCreatives.push({
        id: 'crt_123',
        advertiserId: 'adv_123',
        imageUrl: 'https://ex.com/a.png',
        width: 728,
        height: 90,
        clickUrl: 'https://ex.com',
        reviewStatus: 'auto_approved',
        reviewLog: [],
      });

      const res = await app.request('/v1/creatives/crt_123', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('crt_123');
    });
  });

  describe('GET /v1/campaigns', () => {
    it('lists campaigns for the advertiser', async () => {
      mockAdvertisers.push({
        id: 'adv_123',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blóm og lauf',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 0,
        status: 'active',
        createdAt: new Date(),
      });
      mockCampaigns.push({
        id: 'cmp_123',
        advertiserId: 'adv_123',
        creativeIds: ['crt_123'],
        targeting: { categories: ['matur'] },
        schedule: { startsAt: new Date(), endsAt: new Date(Date.now() + 86400_000) },
        budget: { mode: 'cpm_capped', totalIsk: 10000, remainingIsk: 10000 },
        status: 'active',
      });

      const res = await app.request('/v1/campaigns', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe('cmp_123');
    });
  });

  describe('GET /v1/campaigns/:id', () => {
    it('returns the specific campaign', async () => {
      mockAdvertisers.push({
        id: 'adv_123',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blóm og lauf',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 0,
        status: 'active',
        createdAt: new Date(),
      });
      mockCampaigns.push({
        id: 'cmp_123',
        advertiserId: 'adv_123',
        creativeIds: ['crt_123'],
        targeting: { categories: ['matur'] },
        schedule: { startsAt: new Date(), endsAt: new Date(Date.now() + 86400_000) },
        budget: { mode: 'cpm_capped', totalIsk: 10000, remainingIsk: 10000 },
        status: 'active',
      });

      const res = await app.request('/v1/campaigns/cmp_123', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('cmp_123');
    });
  });

  describe('PATCH /v1/campaigns/:id', () => {
    it('updates campaign fields', async () => {
      mockAdvertisers.push({
        id: 'adv_123',
        ownerEmail: 'advertiser@example.is',
        companyName: 'Blóm og lauf',
        kennitala: '5555555555',
        vatNumber: '98765',
        walletBalanceIsk: 0,
        status: 'active',
        createdAt: new Date(),
      });
      mockCampaigns.push({
        id: 'cmp_123',
        advertiserId: 'adv_123',
        creativeIds: ['crt_123'],
        targeting: { categories: ['matur'] },
        schedule: { startsAt: new Date(), endsAt: new Date(Date.now() + 86400_000) },
        budget: { mode: 'cpm_capped', totalIsk: 10000, remainingIsk: 10000 },
        status: 'active',
      });

      const res = await app.request('/v1/campaigns/cmp_123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          status: 'paused',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('paused');
    });
  });
});
