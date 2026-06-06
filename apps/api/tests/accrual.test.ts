import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FLAT_CPM_ISK } from '@ada/shared';

interface MockLedgerEntry {
  id: string;
  party: { type: string; id: string };
  type: string;
  amountIsk: number;
  relatedId: string;
  createdAt: Date;
}

interface MockCampaign {
  id: string;
  advertiserId: string;
  budget: { mode: 'cpm_capped' | 'slot_purchased'; totalIsk: number; remainingIsk: number };
  status: string;
}

interface MockSlot {
  id: string;
  pricing: { mode: 'cpm' | 'slot'; cpmIsk?: number };
}

let mockLedgerEntries: MockLedgerEntry[] = [];
const mockCampaigns = new Map<string, MockCampaign>();
const mockSlots = new Map<string, MockSlot>();
let mockAdvertisers: Array<{ id: string; walletBalanceIsk: number }> = [];
let mockEventsQueue: string[] = [];

vi.mock('../src/lib/firebase', () => {
  return {
    db: {
      collection: vi.fn((colName: string) => {
        const createQuery = (filters: Array<{ prop: string; val: unknown }> = []) => {
          const queryObj: Record<string, unknown> = {
            where: vi.fn((p: string, _op: string, v: unknown) => {
              return createQuery([...filters, { prop: p, val: v }]);
            }),
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn(() => queryObj),
            get: vi.fn(async () => {
              if (colName === 'ledger') {
                let filtered = [...mockLedgerEntries];
                for (const filter of filters) {
                  if (filter.prop === 'party.type') {
                    filtered = filtered.filter((e) => e.party.type === filter.val);
                  } else if (filter.prop === 'party.id') {
                    filtered = filtered.filter((e) => e.party.id === filter.val);
                  } else if (filter.prop === 'relatedId') {
                    filtered = filtered.filter((e) => e.relatedId === filter.val);
                  } else if (filter.prop === 'type') {
                    filtered = filtered.filter((e) => e.type === filter.val);
                  }
                }
                return {
                  empty: filtered.length === 0,
                  docs: filtered.map((item) => ({
                    data: () => item,
                  })),
                };
              }
              return { empty: true, docs: [] };
            }),
            withConverter: vi.fn(() => ({
              get: vi.fn(async () => {
                if (colName === 'ledger') {
                  let filtered = [...mockLedgerEntries];
                  for (const filter of filters) {
                    if (filter.prop === 'party.type') {
                      filtered = filtered.filter((e) => e.party.type === filter.val);
                    } else if (filter.prop === 'party.id') {
                      filtered = filtered.filter((e) => e.party.id === filter.val);
                    } else if (filter.prop === 'relatedId') {
                      filtered = filtered.filter((e) => e.relatedId === filter.val);
                    } else if (filter.prop === 'type') {
                      filtered = filtered.filter((e) => e.type === filter.val);
                    }
                  }
                  return {
                    empty: filtered.length === 0,
                    docs: filtered.map((item) => ({
                      data: () => item,
                    })),
                  };
                }
                return { empty: true, docs: [] };
              }),
            })),
          };
          return queryObj;
        };

        return {
          doc: vi.fn((id: string) => ({
            id,
            update: vi.fn(async (fields: any) => {
              if (colName === 'campaigns') {
                const found = mockCampaigns.get(id);
                if (found) {
                  if (fields['budget.remainingIsk'] !== undefined) {
                    found.budget.remainingIsk = fields['budget.remainingIsk'];
                  }
                  if (fields.status !== undefined) {
                    found.status = fields.status;
                  }
                }
              } else if (colName === 'advertisers') {
                const found = mockAdvertisers.find((a) => a.id === id);
                if (found) {
                  Object.assign(found, fields);
                }
              }
            }),
            withConverter: vi.fn(() => ({
              set: vi.fn(async (val: any) => {
                if (colName === 'ledger') {
                  mockLedgerEntries.push(val as MockLedgerEntry);
                }
              }),
              get: vi.fn(async () => {
                if (colName === 'campaigns') {
                  const found = mockCampaigns.get(id);
                  return {
                    exists: found !== undefined,
                    data: () => found,
                  };
                } else if (colName === 'slots') {
                  const found = mockSlots.get(id);
                  return {
                    exists: found !== undefined,
                    data: () => found,
                  };
                }
                return { exists: false, data: () => null };
              }),
            })),
          })),
          ...createQuery(),
        };
      }),
    },
    auth: {},
    storage: {},
  };
});

vi.mock('../src/lib/redis', () => ({
  getRedis: () => ({
    rpop: vi.fn(async () => mockEventsQueue.pop() || null),
  }),
}));

// Mock pushCacheForCampaign to avoid actual cache push side effects in these tests
vi.mock('../src/lib/push-cache', () => ({
  pushCacheForCampaign: vi.fn(async () => {}),
}));

import { drainAndAccrue } from '../src/services/accrual';

async function seedWalletCampaignSlot({
  balanceIsk,
  cpmIsk,
  totalIsk = 50000,
}: {
  balanceIsk: number;
  cpmIsk: number;
  totalIsk?: number;
}) {
  mockAdvertisers.push({ id: 'adv_acc', walletBalanceIsk: balanceIsk });
  // Seed initial top-up to establish balance
  mockLedgerEntries.push({
    id: 'ldg_topup',
    party: { type: 'advertiser', id: 'adv_acc' },
    type: 'topup',
    amountIsk: balanceIsk,
    relatedId: 'topup_1',
    createdAt: new Date(),
  });

  mockCampaigns.set('cmp_acc', {
    id: 'cmp_acc',
    advertiserId: 'adv_acc',
    budget: {
      mode: 'cpm_capped',
      totalIsk,
      remainingIsk: totalIsk,
    },
    status: 'active',
  });

  mockSlots.set('slot_acc', {
    id: 'slot_acc',
    pricing: {
      mode: 'cpm',
      cpmIsk,
    },
  });
}

function enqueueImpressions({
  campaignId,
  slotId,
  publisherId,
  count,
}: {
  campaignId: string;
  slotId: string;
  publisherId: string;
  count: number;
}) {
  for (let i = 0; i < count; i++) {
    mockEventsQueue.push(
      JSON.stringify({
        type: 'impression',
        slotId,
        publisherId,
        creativeId: 'cre_1',
        campaignId,
        ts: Date.now(),
      }),
    );
  }
}

async function getCampaignChargeTotal(advertiserId: string): Promise<number> {
  let total = 0;
  for (const entry of mockLedgerEntries) {
    if (
      entry.party.type === 'advertiser' &&
      entry.party.id === advertiserId &&
      entry.type === 'campaign_charge'
    ) {
      total += Math.abs(entry.amountIsk);
    }
  }
  return total;
}

describe('Accrual Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLedgerEntries = [];
    mockCampaigns.clear();
    mockSlots.clear();
    mockAdvertisers = [];
    mockEventsQueue = [];
  });

  it('charges flat CPM per 1000 impressions, not rounded per impression', async () => {
    await seedWalletCampaignSlot({ balanceIsk: 100000, cpmIsk: FLAT_CPM_ISK });
    enqueueImpressions({
      campaignId: 'cmp_acc',
      slotId: 'slot_acc',
      publisherId: 'pub_acc',
      count: 1000,
    });
    await drainAndAccrue(2000);
    const charge = await getCampaignChargeTotal('adv_acc');
    expect(charge).toBe(FLAT_CPM_ISK);
  });

  it('decrements campaign remainingIsk by the charged amount', async () => {
    await seedWalletCampaignSlot({ balanceIsk: 100000, cpmIsk: FLAT_CPM_ISK, totalIsk: 50000 });
    enqueueImpressions({
      campaignId: 'cmp_acc',
      slotId: 'slot_acc',
      publisherId: 'pub_acc',
      count: 1000,
    });
    await drainAndAccrue(2000);
    const cmp = mockCampaigns.get('cmp_acc');
    expect(cmp!.budget.remainingIsk).toBe(50000 - FLAT_CPM_ISK);
  });
});
