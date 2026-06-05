import { describe, it, expect, vi, beforeEach } from 'vitest';

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

interface MockCampaign {
  id: string;
  advertiserId: string;
  creativeIds: string[];
  targeting: { slotIds: string[] };
  schedule: { startsAt: Date; endsAt: Date };
  budget: { mode: 'cpm_capped' | 'slot_purchased'; totalIsk: number; remainingIsk: number };
  status: string;
}

let mockCreatives: MockCreative[] = [];
let mockAdvertisers: MockAdvertiser[] = [];
let mockCampaigns: MockCampaign[] = [];

vi.mock('../src/lib/firebase', () => {
  return {
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
              }
              if (found) {
                Object.assign(found, fields as Record<string, unknown>);
              }
            }),
            withConverter: vi.fn(() => ({
              set: vi.fn(async (val: unknown) => {
                if (colName === 'creatives') {
                  mockCreatives.push(val as MockCreative);
                } else if (colName === 'campaigns') {
                  mockCampaigns.push(val as MockCampaign);
                } else if (colName === 'advertisers') {
                  mockAdvertisers.push(val as MockAdvertiser);
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
    auth: {},
    storage: {},
  };
});

import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import { listAdminQueue, adminReview } from '../src/services/approvals';

describe('Admin Approvals Service', () => {
  beforeEach(() => {
    mockCreatives = [];
    mockAdvertisers = [];
    mockCampaigns = [];
  });

  async function seedFlagedCreative() {
    const adv = await createAdvertiser({
      ownerEmail: 'a@a.is',
      companyName: 'A',
      kennitala: '1234567890',
      vatNumber: '1',
    });
    // Stub flags suspicious link shortener clickUrl (bit.ly/x123)
    const cre = await createCreative(
      adv.id,
      {
        imageUrl: 'https://example/x.png',
        width: 728,
        height: 90,
        clickUrl: 'https://bit.ly/x123',
      },
      new StubAutoScanner(),
    );
    return cre;
  }

  describe('listAdminQueue', () => {
    it('lists only pending creatives', async () => {
      const c = await seedFlagedCreative();
      expect(c.reviewStatus).toBe('pending');
      const q = await listAdminQueue();
      expect(q.map((x) => x.id)).toContain(c.id);
    });
  });

  describe('adminReview', () => {
    it('approves and transitions to manual_approved with log entry', async () => {
      const c = await seedFlagedCreative();
      const updated = await adminReview(c.id, {
        action: 'approve',
        adminEmail: 'admin@a.is',
      });
      expect(updated.reviewStatus).toBe('manual_approved');
      expect(updated.reviewLog.at(-1)!.by).toBe('admin:admin@a.is');
      expect(updated.reviewLog.at(-1)!.action).toBe('approved');
    });

    it('rejects and transitions to rejected with reason', async () => {
      const c = await seedFlagedCreative();
      const updated = await adminReview(c.id, {
        action: 'reject',
        adminEmail: 'admin@a.is',
        reason: 'Suspicious URL',
      });
      expect(updated.reviewStatus).toBe('rejected');
      expect(updated.reviewLog.at(-1)!.reason).toBe('Suspicious URL');
    });
  });
});
