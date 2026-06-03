import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockLedgerEntry {
  id: string;
  party: { type: 'advertiser' | 'publisher' | 'platform'; id: string };
  type: string;
  amountIsk: number;
  relatedId: string;
  createdAt: Date;
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

let mockLedgerEntries: MockLedgerEntry[] = [];
let mockAdvertisers: MockAdvertiser[] = [];

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
              let filtered = [...mockLedgerEntries];
              for (const filter of filters) {
                if (filter.prop === 'relatedId') {
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
            }),
            withConverter: vi.fn(() => ({
              get: vi.fn(async () => {
                const baseFiltered =
                  colName === 'ledger'
                    ? (mockLedgerEntries as unknown as Record<string, unknown>[])
                    : (mockAdvertisers as unknown as Record<string, unknown>[]);
                let filtered = [...baseFiltered];
                for (const filter of filters) {
                  if (filter.prop === 'party.type') {
                    filtered = filtered.filter(
                      (e) => (e.party as { type: string }).type === filter.val,
                    );
                  } else if (filter.prop === 'party.id') {
                    filtered = filtered.filter(
                      (e) => (e.party as { id: string }).id === filter.val,
                    );
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
              }),
            })),
          };
          return queryObj;
        };

        return {
          doc: vi.fn((id: string) => ({
            id,
            update: vi.fn(async (fields: unknown) => {
              if (colName === 'advertisers') {
                const found = mockAdvertisers.find((a) => a.id === id);
                if (found) {
                  Object.assign(found, fields as Partial<MockAdvertiser>);
                }
              }
            }),
            withConverter: vi.fn(() => ({
              set: vi.fn(async (val: unknown) => {
                if (colName === 'ledger') {
                  mockLedgerEntries.push(val as MockLedgerEntry);
                } else if (colName === 'advertisers') {
                  mockAdvertisers.push(val as MockAdvertiser);
                }
              }),
              get: vi.fn(async () => {
                let found: Record<string, unknown> | null = null;
                if (colName === 'ledger') {
                  found =
                    (mockLedgerEntries.find((e) => e.id === id) as unknown as Record<
                      string,
                      unknown
                    >) || null;
                } else if (colName === 'advertisers') {
                  found =
                    (mockAdvertisers.find((a) => a.id === id) as unknown as Record<
                      string,
                      unknown
                    >) || null;
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

import { createAdvertiser, getAdvertiserById } from '../src/services/advertisers';
import {
  topUp,
  getWallet,
  chargeCampaign,
  refundCampaign,
  creditPublisher,
} from '../src/services/wallet';
import { DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';

describe('Wallet Service', () => {
  beforeEach(() => {
    mockLedgerEntries = [];
    mockAdvertisers = [];
  });

  async function seedAdv() {
    return createAdvertiser({
      ownerEmail: 'a@a.is',
      companyName: 'A',
      kennitala: '1234567890',
      vatNumber: '1',
    });
  }

  describe('topUp', () => {
    it('increments wallet balance', async () => {
      const a = await seedAdv();
      await topUp(a.id, 20000, 'teya_tx_1');
      const w = await getWallet(a.id);
      expect(w.balanceIsk).toBe(20000);
      const updated = await getAdvertiserById(a.id);
      expect(updated!.walletBalanceIsk).toBe(20000);
    });

    it('rejects negative amount', async () => {
      const a = await seedAdv();
      await expect(topUp(a.id, -100, 'x')).rejects.toThrow();
    });
  });

  describe('chargeCampaign', () => {
    it('decrements wallet by charge amount', async () => {
      const a = await seedAdv();
      await topUp(a.id, 10000, 't');
      await chargeCampaign(a.id, 'cmp_x', 3000);
      expect((await getWallet(a.id)).balanceIsk).toBe(7000);
    });

    it('rejects when balance insufficient', async () => {
      const a = await seedAdv();
      await topUp(a.id, 1000, 't');
      await expect(chargeCampaign(a.id, 'cmp_x', 5000)).rejects.toThrow(/insufficient/);
    });
  });

  describe('refundCampaign', () => {
    it('restores balance', async () => {
      const a = await seedAdv();
      await topUp(a.id, 10000, 't');
      await chargeCampaign(a.id, 'cmp_x', 3000);
      await refundCampaign(a.id, 'cmp_x', 1500);
      expect((await getWallet(a.id)).balanceIsk).toBe(8500);
    });
  });

  describe('creditPublisher', () => {
    it('credits publisher net and platform fee', async () => {
      await creditPublisher('pub_x', 'cmp_y', 1000);
      const { sumByParty } = await import('../src/services/ledger');
      const pubSum = await sumByParty({ type: 'publisher', id: 'pub_x' });
      expect(pubSum).toBe(800); // 1000 * (1 - 20/100)
      const platSum = await sumByParty({ type: 'platform', id: 'platform' });
      expect(platSum).toBe(200);
    });

    it('honors DEFAULT_PLATFORM_FEE_PERCENT', () => {
      expect(DEFAULT_PLATFORM_FEE_PERCENT).toBe(20);
    });
  });
});
