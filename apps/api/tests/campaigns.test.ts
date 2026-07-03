import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCampaign,
  listCampaignsForAdvertiser,
  updateCampaign,
} from '../src/services/campaigns';

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
                const filtered = mockCampaigns.filter((c) => (c as any)[prop] === val);
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

// Wallet balance is a funding gate for campaign creation/increase — mock it
// with a controllable value (default: plenty) so existing tests stay funded.
const mockWalletBalance = vi.hoisted(() => ({ value: 1_000_000 }));
vi.mock('../src/services/wallet', () => ({
  getWallet: vi.fn(async (advertiserId: string) => ({
    advertiserId,
    balanceIsk: mockWalletBalance.value,
  })),
}));

describe('Campaign Service', () => {
  beforeEach(() => {
    mockAdvertisers = [];
    mockCreatives = [];
    mockCampaigns = [];
    mockWalletBalance.value = 1_000_000;
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
    it('rejects creation when the wallet balance is below the campaign budget', async () => {
      const { adv, cre } = setupMockData();
      mockWalletBalance.value = 19_999;
      await expect(
        createCampaign(adv.id, {
          creativeIds: [cre.id],
          categories: ['matur'],
          schedule: {
            startsAt: new Date(Date.now() + 1000),
            endsAt: new Date(Date.now() + 86400_000),
          },
          budget: { mode: 'cpm_capped', totalIsk: 20_000 },
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    });

    it('rejects a budget increase beyond the wallet balance, but allows reductions', async () => {
      const { adv, cre } = setupMockData();
      const cmp = await createCampaign(adv.id, {
        creativeIds: [cre.id],
        categories: ['matur'],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20_000 },
      });
      mockWalletBalance.value = 9_000;
      await expect(updateCampaign(cmp.id, { budget: { totalIsk: 30_000 } })).rejects.toMatchObject({
        code: 'INSUFFICIENT_FUNDS',
      });
      // Reducing the budget must not require balance
      const reduced = await updateCampaign(cmp.id, { budget: { totalIsk: 10_000 } });
      expect(reduced.budget.totalIsk).toBe(10_000);
    });

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

    it('creates a campaign with optional geoRegions targeting', async () => {
      const { adv, cre } = setupMockData();
      const cmp = await createCampaign(adv.id, {
        creativeIds: [cre.id],
        categories: ['matur'],
        geoRegions: ['capital'],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20000 },
      });
      expect(cmp.targeting.geoRegions).toEqual(['capital']);
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

  describe('updateCampaign', () => {
    it('successfully updates campaign details', async () => {
      const { adv, cre } = setupMockData();
      const cmp = await createCampaign(adv.id, {
        name: 'Initial Name',
        creativeIds: [cre.id],
        categories: ['matur'],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20000 },
      });

      const nextStartsAt = new Date(Date.now() + 5000);
      const nextEndsAt = new Date(Date.now() + 90000_000);

      const updated = await updateCampaign(cmp.id, {
        name: 'Updated Name',
        categories: ['taekni'],
        geoRegions: ['capital'],
        schedule: {
          startsAt: nextStartsAt,
          endsAt: nextEndsAt,
        },
        budget: {
          totalIsk: 30000,
        },
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.targeting.categories).toEqual(['taekni']);
      expect(updated.targeting.geoRegions).toEqual(['capital']);
      expect(updated.schedule.startsAt.getTime()).toBe(nextStartsAt.getTime());
      expect(updated.schedule.endsAt.getTime()).toBe(nextEndsAt.getTime());
      expect(updated.budget.totalIsk).toBe(30000);
      expect(updated.budget.remainingIsk).toBe(30000);
    });

    it('rejects budget update below spent amount', async () => {
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

      // Simulate spent amount by manually setting remainingIsk lower
      const dbCmp = mockCampaigns.find((c) => c.id === cmp.id);
      if (dbCmp) {
        dbCmp.budget.remainingIsk = 5000; // Spent is 15000 ISK
      }

      // Updating budget to 16000 should succeed
      const updatedOk = await updateCampaign(cmp.id, {
        budget: { totalIsk: 16000 },
      });
      expect(updatedOk.budget.remainingIsk).toBe(1000); // 16000 - 15000 = 1000

      // Updating budget to 14000 should fail (spent is 15000)
      await expect(
        updateCampaign(cmp.id, {
          budget: { totalIsk: 14000 },
        }),
      ).rejects.toThrow('Budget cannot be reduced below spent amount of 15000 ISK');
    });

    it('rejects update if creative is owned by another advertiser', async () => {
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

      // Add another advertiser's creative
      const otherCre: MockCreative = {
        id: 'cre_other',
        advertiserId: 'adv_other',
        imageUrl: 'https://x/other.png',
        width: 728,
        height: 90,
        clickUrl: 'https://x.is',
        reviewStatus: 'auto_approved',
        reviewLog: [],
      };
      mockCreatives.push(otherCre);

      await expect(
        updateCampaign(cmp.id, {
          creativeIds: [otherCre.id],
        }),
      ).rejects.toThrow('Creative cre_other is not owned by advertiser');
    });
  });
});
