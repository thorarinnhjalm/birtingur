import { describe, it, expect, vi, beforeEach } from 'vitest';
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

let mockAdvertisers: MockAdvertiser[] = [];
let mockCreatives: MockCreative[] = [];
let mockCampaigns: MockCampaign[] = [];
let mockPublishers: MockPublisher[] = [];
let mockSlots: MockSlot[] = [];

vi.mock('../src/lib/firebase', () => {
  return {
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === 'admin-token') {
          return { uid: 'u-admin', email: 'admin@a.is', admin: true };
        } else if (token === 'pub-token') {
          return { uid: 'u-pub', email: 'pub@publisher.is' };
        } else if (token === 'adv-token') {
          return { uid: 'u-adv', email: 'adv@advertiser.is' };
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
          queryObj.withConverter = vi.fn(() => ({
            get: queryObj.get,
          }));
          return queryObj;
        };

        return {
          doc: vi.fn((id: string) => ({
            id,
            update: vi.fn(async (fields: unknown) => {
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
              }
              if (found) {
                Object.assign(found, fields as Record<string, unknown>);
              }
            }),
            withConverter: vi.fn(() => ({
              set: vi.fn(async (val: unknown) => {
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
                }
              }),
              get: vi.fn(async () => {
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
                }
                return {
                  exists: found !== undefined && found !== null,
                  data: () => found,
                };
              }),
            })),
          })),
          ...createQuery(),
        };
      }),
    },
    storage: {},
  };
});

describe('E2E Approval Flow Routes', () => {
  beforeEach(() => {
    mockAdvertisers = [];
    mockCreatives = [];
    mockCampaigns = [];
    mockPublishers = [];
    mockSlots = [];
    vi.clearAllMocks();
  });

  it('admin review workflow: queues pending creatives, admin approves or rejects', async () => {
    // 1. Create Advertiser
    const advRes = await app.request('/v1/advertisers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer adv-token',
      },
      body: JSON.stringify({
        companyName: 'Bókaforlagið Saga',
        kennitala: '1234567890',
        vatNumber: '12345',
      }),
    });
    expect(advRes.status).toBe(201);
    const advertiser = await advRes.json();

    // 2. Upload creative that AutoScan flags (bit.ly URL in StubAutoScanner)
    const creRes = await app.request('/v1/creatives', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer adv-token',
      },
      body: JSON.stringify({
        imageUrl: 'https://cdn.example.is/images/ad1.png',
        width: 728,
        height: 90,
        clickUrl: 'https://bit.ly/x123',
      }),
    });
    expect(creRes.status).toBe(201);
    const { creative } = await creRes.json();
    expect(creative.reviewStatus).toBe('pending');

    // 3. Admin retrieves the review queue
    const queueRes = await app.request('/v1/admin/review-queue/queue', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer admin-token',
      },
    });
    expect(queueRes.status).toBe(200);
    const queueBody = await queueRes.json();
    expect(queueBody.queue.map((c: any) => c.id)).toContain(creative.id);

    // 4. Admin approves the creative
    const approveRes = await app.request(`/v1/admin/review-queue/${creative.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-token',
      },
      body: JSON.stringify({
        action: 'approve',
      }),
    });
    expect(approveRes.status).toBe(200);
    const approvedCreative = await approveRes.json();
    expect(approvedCreative.creative.reviewStatus).toBe('manual_approved');
    expect(approvedCreative.creative.reviewLog.at(-1).action).toBe('approved');
  });

  it('publisher approvals workflow: lists publisher queue, publisher approves campaign', async () => {
    // 1. Create Advertiser & Advertiser Wallet top up
    const advRes = await app.request('/v1/advertisers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer adv-token',
      },
      body: JSON.stringify({
        companyName: 'Bókaforlagið Saga',
        kennitala: '1234567890',
        vatNumber: '12345',
      }),
    });
    expect(advRes.status).toBe(201);
    const advertiser = await advRes.json();

    // Setup wallet via mock since topUp appends ledger and we sum it
    mockAdvertisers[0].walletBalanceIsk = 100000;

    // 2. Create Publisher (with contentPolicy.requireManualApproval = true)
    const pubRes = await app.request('/v1/publishers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pub-token',
      },
      body: JSON.stringify({
        domain: 'morgunbladid.is',
        displayName: 'Morgunblaðið',
        payoutMethod: {
          type: 'bank',
          iban: 'IS260123456789012345678901',
          kennitala: '5566778899',
          accountName: 'Árvakur hf.',
        },
        contentPolicy: {
          blockedCategories: [],
          requireManualApproval: true,
        },
      }),
    });
    expect(pubRes.status).toBe(201);
    const publisher = await pubRes.json();

    // 3. Create Slot for Publisher
    const slotRes = await app.request('/v1/publishers/me/slots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pub-token',
      },
      body: JSON.stringify({
        name: 'Forsíða Banner',
        sizes: [{ width: 728, height: 90 }],
        pricing: {
          mode: 'cpm',
          cpmIsk: 1200,
        },
        placement: {
          pageMatcher: '^/$',
          position: 'above_fold',
        },
      }),
    });
    expect(slotRes.status).toBe(201);
    const slot = await slotRes.json();

    // 4. Create Creative (auto-approved so it doesn't get stuck)
    const creRes = await app.request('/v1/creatives', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer adv-token',
      },
      body: JSON.stringify({
        imageUrl: 'https://cdn.example.is/images/ad1.png',
        width: 728,
        height: 90,
        clickUrl: 'https://safe.is/saga',
      }),
    });
    expect(creRes.status).toBe(201);
    const { creative } = await creRes.json();
    expect(creative.reviewStatus).toBe('auto_approved');

    // 5. Create Campaign targeting the slot (which has requireManualApproval = true)
    const campaignRes = await app.request('/v1/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer adv-token',
      },
      body: JSON.stringify({
        creativeIds: [creative.id],
        slotIds: [slot.id],
        schedule: {
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 86400000 * 5).toISOString(),
        },
        budget: {
          mode: 'cpm_capped',
          totalIsk: 50000,
        },
      }),
    });
    expect(campaignRes.status).toBe(201);
    const { campaign } = await campaignRes.json();
    expect(campaign.status).toBe('pending_approval');
    expect(campaign.perPublisherApproval[publisher.id]).toBe('pending');

    // 6. Publisher lists their pending approvals queue
    const pendingQueueRes = await app.request('/v1/publishers/me/pending-approvals', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer pub-token',
      },
    });
    expect(pendingQueueRes.status).toBe(200);
    const pendingQueue = await pendingQueueRes.json();
    expect(pendingQueue.items.length).toBe(1);
    expect(pendingQueue.items[0].campaign.id).toBe(campaign.id);
    expect(pendingQueue.items[0].creative.id).toBe(creative.id);

    // 7. Publisher approves the campaign
    const decisionRes = await app.request(`/v1/publishers/me/approvals/${campaign.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer pub-token',
      },
      body: JSON.stringify({
        action: 'approve',
      }),
    });
    expect(decisionRes.status).toBe(200);
    const updatedCmp = await decisionRes.json();
    expect(updatedCmp.campaign.perPublisherApproval[publisher.id]).toBe('approved');
    expect(updatedCmp.campaign.status).toBe('active');
  });
});
