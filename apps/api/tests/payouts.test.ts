import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockLedgerEntry {
  id: string;
  party: { type: 'publisher' | 'advertiser'; id: string };
  type: string;
  amountIsk: number;
  relatedId: string;
  createdAt: Date;
}

interface MockPayout {
  id: string;
  publisherId: string;
  periodStart: Date;
  periodEnd: Date;
  grossIsk: number;
  platformFeeIsk: number;
  netIsk: number;
  status: 'pending' | 'processing' | 'completed';
  bankReference: string;
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

let mockLedger: MockLedgerEntry[] = [];
let mockPayouts: MockPayout[] = [];
let mockPublishers: MockPublisher[] = [];

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
              if (colName === 'ledger') {
                filtered = [...mockLedger];
              } else if (colName === 'payouts') {
                filtered = [...mockPayouts];
              } else if (colName === 'publishers') {
                filtered = [...mockPublishers];
              }

              for (const filter of filters) {
                filtered = filtered.filter((item) => {
                  const itemVal = item[filter.prop];

                  if (filter.op === '==') {
                    return itemVal === filter.val;
                  } else if (filter.op === '>=') {
                    return (itemVal as any) >= (filter.val as any);
                  } else if (filter.op === '<=') {
                    return (itemVal as any) <= (filter.val as any);
                  } else if (filter.op === 'in') {
                    return Array.isArray(filter.val) && filter.val.includes(itemVal);
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
            withConverter: vi.fn(() => ({
              set: vi.fn(async (val: unknown) => {
                if (colName === 'payouts') {
                  const idx = mockPayouts.findIndex((p) => p.id === id);
                  if (idx !== -1) mockPayouts[idx] = val as MockPayout;
                  else mockPayouts.push(val as MockPayout);
                } else if (colName === 'ledger') {
                  mockLedger.push(val as MockLedgerEntry);
                } else if (colName === 'publishers') {
                  mockPublishers.push(val as MockPublisher);
                }
              }),
              get: vi.fn(async () => {
                let found: any = null;
                if (colName === 'payouts') {
                  found = mockPayouts.find((p) => p.id === id);
                } else if (colName === 'ledger') {
                  found = mockLedger.find((l) => l.id === id);
                } else if (colName === 'publishers') {
                  found = mockPublishers.find((p) => p.id === id);
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

import { createPublisher } from '../src/services/publishers';
import { creditPublisher } from '../src/services/wallet';
import {
  generateMonthlyPayouts,
  listPendingPayouts,
  markPayoutCompleted,
} from '../src/services/payouts';

async function seedPublisher() {
  return createPublisher({
    ownerEmail: 'p@p.is',
    domain: 'p.is',
    displayName: 'P',
    payoutMethod: {
      type: 'bank',
      iban: 'IS140159260076545510730339',
      kennitala: '1234567890',
      accountName: 'P',
    },
    contentPolicy: {
      blockedCategories: [],
      requireManualApproval: false,
    },
  });
}

describe('Monthly Payouts Service', () => {
  beforeEach(() => {
    mockLedger = [];
    mockPayouts = [];
    mockPublishers = [];
  });

  describe('generateMonthlyPayouts', () => {
    it('creates pending payout from publisher credits in period', async () => {
      const p = await seedPublisher();
      // 10.000 gross → 8.000 net (after 20% platform fee)
      await creditPublisher(p.id, 'cmp_1', 10000);
      
      // Set the createdAt of the ledger entry to be within the window
      mockLedger[0].createdAt = new Date(Date.now() - 86400_000 * 5); // 5 days ago

      const periodStart = new Date(Date.now() - 86400_000 * 30);
      const periodEnd = new Date(Date.now() + 86400_000);
      const created = await generateMonthlyPayouts(periodStart, periodEnd);
      expect(created.length).toBe(1);
      expect(created[0]!.publisherId).toBe(p.id);
      expect(created[0]!.netIsk).toBe(8000);
      expect(created[0]!.status).toBe('pending');
    });

    it('skips publishers with net under MIN_PAYOUT_ISK', async () => {
      const p = await seedPublisher();
      // 1000 gross → 800 net, under 5000 threshold
      await creditPublisher(p.id, 'cmp_2', 1000);
      mockLedger[0].createdAt = new Date(Date.now() - 86400_000 * 5);

      const periodStart = new Date(Date.now() - 86400_000 * 30);
      const periodEnd = new Date(Date.now() + 86400_000);
      const created = await generateMonthlyPayouts(periodStart, periodEnd);
      expect(created.length).toBe(0);
    });
  });

  describe('markPayoutCompleted', () => {
    it('marks payout completed and appends payout ledger entry', async () => {
      const p = await seedPublisher();
      await creditPublisher(p.id, 'cmp_3', 20000);
      mockLedger[0].createdAt = new Date(Date.now() - 86400_000 * 5);

      const periodStart = new Date(Date.now() - 86400_000 * 30);
      const periodEnd = new Date(Date.now() + 86400_000);
      const [payout] = await generateMonthlyPayouts(periodStart, periodEnd);
      
      const updated = await markPayoutCompleted(payout!.id, 'BANK_REF_123');
      expect(updated.status).toBe('completed');
      expect(updated.bankReference).toBe('BANK_REF_123');

      const pending = await listPendingPayouts();
      expect(pending.find((x) => x.id === payout!.id)).toBeUndefined();

      // Should append negative payout entry in ledger
      const ledgerEntry = mockLedger.find((l) => l.type === 'payout');
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry!.amountIsk).toBe(-16000);
    });
  });
});
