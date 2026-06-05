import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { app } from '../src/index';

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
  payoutMethod: {
    type: 'bank';
    iban: string;
    kennitala: string;
    accountName: string;
  };
  contentPolicy: {
    blockedCategories: string[];
    requireManualApproval: boolean;
  };
  status: string;
  createdAt: Date;
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

interface MockLedgerEntry {
  id: string;
  party: { type: 'publisher' | 'advertiser' | 'platform'; id: string };
  type: string;
  amountIsk: number;
  relatedId: string;
  createdAt: Date;
}

let mockAdvertisers: MockAdvertiser[] = [];
let mockCreatives: MockCreative[] = [];
let mockCampaigns: MockCampaign[] = [];
let mockPublishers: MockPublisher[] = [];
let mockSlots: MockSlot[] = [];
let mockLedger: MockLedgerEntry[] = [];
let mockWidgetKeys: any[] = [];

vi.mock('../src/lib/firebase', () => {
  return {
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === 'admin-token') {
          return { uid: 'u-admin', email: 'admin@a.is', admin: true };
        } else if (token === 'pub-tok') {
          return { uid: 'u-pub', email: 'pub@p.is' };
        } else if (token === 'adv-tok') {
          return { uid: 'u-adv', email: 'adv@a.is' };
        }
        throw new Error('Invalid token');
      }),
    },
    db: {
      collection: vi.fn((colName: string) => {
        const createQuery = (filters: Array<{ prop: string; op: string; val: unknown }> = []) => {
          const queryObj: any = {
            where: vi.fn((p: string, op: string, v: unknown) => {
              return createQuery([...filters, { prop: p, op, val: v }]);
            }),
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn(() => queryObj),
            get: vi.fn(async () => {
              let filtered: any[] = [];
              if (colName === 'creatives') {
                filtered = [...mockCreatives];
              } else if (colName === 'campaigns') {
                filtered = [...mockCampaigns];
              } else if (colName === 'advertisers') {
                filtered = [...mockAdvertisers];
              } else if (colName === 'publishers') {
                filtered = [...mockPublishers];
              } else if (colName === 'slots') {
                filtered = [...mockSlots];
              } else if (colName === 'ledger') {
                filtered = [...mockLedger];
              } else if (colName === 'widget_keys') {
                filtered = [...mockWidgetKeys];
              }

              for (const filter of filters) {
                const parts = filter.prop.split('.');
                filtered = filtered.filter((item) => {
                  let itemVal = item;
                  for (const part of parts) {
                    if (itemVal == null) break;
                    itemVal = itemVal[part];
                  }

                  if (filter.op === '==') {
                    return itemVal === filter.val;
                  } else if (filter.op === 'array-contains') {
                    return Array.isArray(itemVal) && itemVal.includes(filter.val);
                  }
                  return true;
                });
              }

              return {
                empty: filtered.length === 0,
                docs: filtered.map((item) => ({
                  data: () => item,
                })),
              };
            }),
          };
          queryObj.withConverter = vi.fn(() => queryObj);
          return queryObj;
        };

        return {
          doc: vi.fn((id: string) => {
            const setFn = async (val: unknown) => {
              if (colName === 'creatives') {
                const idx = mockCreatives.findIndex((c) => c.id === id);
                if (idx !== -1) mockCreatives[idx] = val as MockCreative;
                else mockCreatives.push(val as MockCreative);
              } else if (colName === 'campaigns') {
                const idx = mockCampaigns.findIndex((c) => c.id === id);
                if (idx !== -1) mockCampaigns[idx] = val as MockCampaign;
                else mockCampaigns.push(val as MockCampaign);
              } else if (colName === 'advertisers') {
                const idx = mockAdvertisers.findIndex((a) => a.id === id);
                if (idx !== -1) mockAdvertisers[idx] = val as MockAdvertiser;
                else mockAdvertisers.push(val as MockAdvertiser);
              } else if (colName === 'publishers') {
                const idx = mockPublishers.findIndex((p) => p.id === id);
                if (idx !== -1) mockPublishers[idx] = val as MockPublisher;
                else mockPublishers.push(val as MockPublisher);
              } else if (colName === 'slots') {
                const idx = mockSlots.findIndex((s) => s.id === id);
                if (idx !== -1) mockSlots[idx] = val as MockSlot;
                else mockSlots.push(val as MockSlot);
              } else if (colName === 'ledger') {
                mockLedger.push(val as MockLedgerEntry);
              } else if (colName === 'widget_keys') {
                const idx = mockWidgetKeys.findIndex((wk) => wk.id === id);
                if (idx !== -1) mockWidgetKeys[idx] = val;
                else mockWidgetKeys.push(val);
              }
            };

            const getFn = async () => {
              let found: any = null;
              if (colName === 'creatives') {
                found = mockCreatives.find((c) => c.id === id);
              } else if (colName === 'campaigns') {
                found = mockCampaigns.find((c) => c.id === id);
              } else if (colName === 'advertisers') {
                found = mockAdvertisers.find((a) => a.id === id);
              } else if (colName === 'publishers') {
                found = mockPublishers.find((p) => p.id === id);
              } else if (colName === 'slots') {
                found = mockSlots.find((s) => s.id === id);
              } else if (colName === 'widget_keys') {
                found = mockWidgetKeys.find((wk) => wk.id === id);
              }
              return {
                exists: found !== undefined && found !== null,
                data: () => found,
              };
            };

            const updateFn = async (fields: any) => {
              let found: any = null;
              if (colName === 'creatives') {
                found = mockCreatives.find((c) => c.id === id);
              } else if (colName === 'campaigns') {
                found = mockCampaigns.find((c) => c.id === id);
              } else if (colName === 'advertisers') {
                found = mockAdvertisers.find((a) => a.id === id);
              } else if (colName === 'publishers') {
                found = mockPublishers.find((p) => p.id === id);
              } else if (colName === 'slots') {
                found = mockSlots.find((s) => s.id === id);
              } else if (colName === 'widget_keys') {
                found = mockWidgetKeys.find((wk) => wk.id === id);
              }
              if (found) {
                Object.assign(found, fields);
              }
            };

            const docObj: any = {
              id,
              set: vi.fn(setFn),
              get: vi.fn(getFn),
              update: vi.fn(updateFn),
              withConverter: vi.fn((): any => docObj),
            };
            return docObj;
          }),
          ...createQuery(),
        };
      }),
    },
    storage: {},
  };
});

process.env.TEYA_WEBHOOK_SECRET = 'whsec_e2e';

describe('End-to-End Smoke Test', () => {
  beforeEach(() => {
    mockAdvertisers = [];
    mockCreatives = [];
    mockCampaigns = [];
    mockPublishers = [];
    mockSlots = [];
    mockLedger = [];
    mockWidgetKeys = [];
    vi.clearAllMocks();
  });

  it('verifies the full flow: publisher -> slot -> advertiser -> topup -> creative -> campaign -> active', async () => {
    // 1. Create Publisher
    const pubRes = await app.request('/v1/publishers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pub-tok',
      },
      body: JSON.stringify({
        domain: 'kjarninn.is',
        displayName: 'Kjarninn',
        payoutMethod: {
          type: 'bank',
          iban: 'IS140159260076545510730339',
          kennitala: '1111111111',
          accountName: 'Kjarninn Miðlar',
        },
        contentPolicy: {
          blockedCategories: [],
          requireManualApproval: false,
        },
        categories: ['taekni'],
      }),
    });
    expect(pubRes.status).toBe(201);
    const publisher = await pubRes.json();

    // 2. Create Slot
    const slotRes = await app.request('/v1/publishers/me/slots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pub-tok',
      },
      body: JSON.stringify({
        name: 'Forsíða stór',
        sizes: [{ width: 728, height: 90 }],
        pricing: {
          mode: 'cpm',
          cpmIsk: 1500,
        },
        placement: {
          pageMatcher: '^/$',
          position: 'above_fold',
        },
      }),
    });
    expect(slotRes.status).toBe(201);
    const slot = await slotRes.json();

    // 3. Create Advertiser
    const advRes = await app.request('/v1/advertisers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer adv-tok',
      },
      body: JSON.stringify({
        companyName: 'Bóksalan hf.',
        kennitala: '2222222222',
        vatNumber: '998877',
      }),
    });
    expect(advRes.status).toBe(201);
    const { advertiser } = await advRes.json();

    // 4. Top up via Webhook
    const webhookBody = JSON.stringify({
      type: 'checkout.completed',
      data: {
        sessionId: 'e2e_sess_1',
        amountIsk: 50000,
        metadata: { advertiserId: advertiser.id },
      },
    });
    const signature = createHmac('sha256', 'whsec_e2e').update(webhookBody).digest('hex');
    const whRes = await app.request('/api/teya/webhook', {
      method: 'POST',
      headers: {
        'Teya-Signature': signature,
        'Content-Type': 'application/json',
      },
      body: webhookBody,
    });
    expect(whRes.status).toBe(200);

    // Double check advertiser wallet reflection in mock
    expect(mockAdvertisers[0].walletBalanceIsk).toBe(50000);

    // 5. Upload Creative (clean clickUrl -> auto-approved)
    const creRes = await app.request('/v1/creatives', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer adv-tok',
      },
      body: JSON.stringify({
        imageUrl: 'https://cdn.example.com/books.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is/saett',
      }),
    });
    expect(creRes.status).toBe(201);
    const { creative } = await creRes.json();
    expect(creative.reviewStatus).toBe('auto_approved');

    // 6. Create Campaign (active since slot does not require manual approval and creative is auto-approved)
    const campaignRes = await app.request('/v1/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer adv-tok',
      },
      body: JSON.stringify({
        creativeIds: [creative.id],
        categories: ['taekni'],
        schedule: {
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 86400000 * 3).toISOString(),
        },
        budget: {
          mode: 'cpm_capped',
          totalIsk: 10000,
        },
      }),
    });
    if (campaignRes.status !== 201) {
      console.log('campaignRes failed:', campaignRes.status, await campaignRes.json());
    }
    expect(campaignRes.status).toBe(201);
    const campaign = await campaignRes.json();
    expect(campaign.status).toBe('active');
  });
});
