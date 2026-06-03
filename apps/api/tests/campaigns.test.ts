import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCampaign, listCampaignsForAdvertiser } from '../src/services/campaigns';

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
    slotIds: string[];
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
  perPublisherApproval: Record<string, string>;
}

let mockPublishers: MockPublisher[] = [];
let mockSlots: MockSlot[] = [];
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
            if (colName === 'publishers') {
              data = mockPublishers.find((p) => p.id === id);
            } else if (colName === 'slots') {
              data = mockSlots.find((s) => s.id === id);
            } else if (colName === 'advertisers') {
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

describe('Campaign Service', () => {
  beforeEach(() => {
    mockPublishers = [];
    mockSlots = [];
    mockAdvertisers = [];
    mockCreatives = [];
    mockCampaigns = [];
  });

  const setupMockData = () => {
    const pub: MockPublisher = {
      id: 'pub_123',
      ownerEmail: 'p@p.is',
      domain: 'p.is',
      displayName: 'P',
      status: 'active',
      contentPolicy: { blockedCategories: [], requireManualApproval: false },
    };
    const slot: MockSlot = {
      id: 'slot_123',
      publisherId: 'pub_123',
      name: 'A',
      sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm', cpmIsk: 1500 },
      placement: { pageMatcher: '/', position: 'above_fold' },
      status: 'active',
    };
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
    mockPublishers.push(pub);
    mockSlots.push(slot);
    mockAdvertisers.push(adv);
    mockCreatives.push(cre);
    return { pub, slot, adv, cre };
  };

  describe('createCampaign', () => {
    it('creates a CPM-capped campaign in active status when all approved', async () => {
      const { adv, cre, slot } = setupMockData();
      const cmp = await createCampaign(adv.id, {
        creativeIds: [cre.id],
        slotIds: [slot.id],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20000 },
      });
      expect(cmp.id).toMatch(/^cmp_[a-f0-9]{24}$/);
      expect(cmp.status).toBe('active');
      expect(cmp.budget.remainingIsk).toBe(20000);
      expect(cmp.perPublisherApproval.pub_123).toBe('approved');
    });

    it('creates campaign in pending_approval if publisher requireManualApproval is true', async () => {
      const { adv, cre, slot, pub } = setupMockData();
      pub.contentPolicy.requireManualApproval = true;
      const cmp = await createCampaign(adv.id, {
        creativeIds: [cre.id],
        slotIds: [slot.id],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 20000 },
      });
      expect(cmp.status).toBe('pending_approval');
      expect(cmp.perPublisherApproval.pub_123).toBe('pending');
    });

    it('rejects when creativeIds reference unknown creative', async () => {
      const { adv, slot } = setupMockData();
      await expect(
        createCampaign(adv.id, {
          creativeIds: ['cre_nope'],
          slotIds: [slot.id],
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
      const { adv, cre, slot } = setupMockData();
      await createCampaign(adv.id, {
        creativeIds: [cre.id],
        slotIds: [slot.id],
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
