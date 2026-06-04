import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCampaign, listCampaignsForAdvertiser } from '../src/services/campaigns';

interface MockAdvertiser {
  id: string;
  ownerEmail: string;
  companyName: string;
  kennitala: string;
  vatNumber: string;
  walletBalanceIsk: number;
  status: string;
}

interface MockCreative {
  id: string;
  advertiserId: string;
  imageUrl: string;
  width: number;
  height: number;
  clickUrl: string;
  reviewStatus: string;
  reviewLog: unknown[];
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

let mockAdvertisers: MockAdvertiser[] = [];
let mockCreatives: MockCreative[] = [];
let mockCampaigns: MockCampaign[] = [];

vi.mock('../src/lib/firebase', () => ({
  db: {
    collection: vi.fn((colName: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        withConverter: vi.fn(() => ({
          get: vi.fn(async () => {
            let data: unknown = null;
            if (colName === 'advertisers') {
              data = mockAdvertisers.find((a) => a.id === id);
            } else if (colName === 'creatives') {
              data = mockCreatives.find((c) => c.id === id);
            } else if (colName === 'campaigns') {
              data = mockCampaigns.find((c) => c.id === id);
            }
            return {
              exists: data !== undefined && data !== null,
              data: () => data,
            };
          }),
          set: vi.fn(async (val: unknown) => {
            if (colName === 'campaigns') {
              const cmpVal = val as MockCampaign;
              const idx = mockCampaigns.findIndex((c) => c.id === id);
              if (idx >= 0) {
                mockCampaigns[idx] = cmpVal;
              } else {
                mockCampaigns.push(cmpVal);
              }
            }
          }),
        })),
      })),
      where: vi.fn((prop: string, _op: string, val: unknown) => {
        const builder = {
          withConverter: vi.fn(() => ({
            get: vi.fn(async () => {
              if (colName === 'campaigns') {
                const filtered = mockCampaigns.filter(
                  (c) => (c as Record<string, unknown>)[prop] === val,
                );
                return {
                  docs: filtered.map((c) => ({
                    data: () => c,
                  })),
                };
              }
              return { docs: [] };
            }),
          })),
        };
        return builder;
      }),
    })),
  },
  auth: {},
  storage: {},
}));

// Mock pushCacheForCampaign
vi.mock('../src/lib/push-cache', () => ({
  pushCacheForCampaign: vi.fn(async () => {}),
}));

describe('Campaign Service', () => {
  beforeEach(() => {
    mockAdvertisers = [];
    mockCreatives = [];
    mockCampaigns = [];
  });

  const setupMockData = () => {
    const adv: MockAdvertiser = {
      id: 'adv_123',
      ownerEmail: 'a@a.is',
      companyName: 'A',
      kennitala: '2222222222',
      vatNumber: '1',
      walletBalanceIsk: 0,
      status: 'active',
    };
    const cre: MockCreative = {
      id: 'cre_123',
      advertiserId: 'adv_123',
      imageUrl: 'https://x/y.png',
      width: 728,
      height: 90,
      clickUrl: 'https://x.is',
      reviewStatus: 'auto_approved',
      reviewLog: [],
    };
    mockAdvertisers.push(adv);
    mockCreatives.push(cre);
    return { adv, cre };
  };

  describe('createCampaign', () => {
    it('creates a category-targeted campaign that is active when creatives are approved', async () => {
      const { adv, cre } = setupMockData();
      const cmp = await createCampaign(adv.id, {
        creativeIds: [cre.id],
        categories: ['matur'],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20000 },
      });
      expect(cmp.id).toMatch(/^cmp_[a-f0-9]{24}$/);
      expect(cmp.targeting.categories).toEqual(['matur']);
      expect(cmp.status).toBe('active');
      expect(cmp.budget.remainingIsk).toBe(20000);
      expect((cmp as any).perPublisherApproval).toBeUndefined();
    });

    it('creates campaign in pending_approval if creatives are not approved', async () => {
      const { adv, cre } = setupMockData();
      cre.reviewStatus = 'pending';
      const cmp = await createCampaign(adv.id, {
        creativeIds: [cre.id],
        categories: ['matur'],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20000 },
      });
      expect(cmp.status).toBe('pending_approval');
    });

    it('rejects when creativeIds reference unknown creative', async () => {
      const { adv } = setupMockData();
      await expect(
        createCampaign(adv.id, {
          creativeIds: ['cre_nope'],
          categories: ['matur'],
          schedule: {
            startsAt: new Date(Date.now() + 1000),
            endsAt: new Date(Date.now() + 86400_000),
          },
          budget: { mode: 'cpm_capped', totalIsk: 1000 },
        }),
      ).rejects.toThrow();
    });
  });

  describe('listCampaignsForAdvertiser', () => {
    it('returns campaigns for advertiser', async () => {
      const { adv, cre } = setupMockData();
      await createCampaign(adv.id, {
        creativeIds: [cre.id],
        categories: ['matur'],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20000 },
      });
      const list = await listCampaignsForAdvertiser(adv.id);
      expect(list).toHaveLength(1);
    });
  });
});
