import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockLedgerEntry {
  id: string;
  party: { type: 'advertiser' | 'publisher' | 'platform'; id: string };
  type: string;
  amountIsk: number;
  relatedId: string;
  createdAt: Date;
}

let mockLedgerEntries: MockLedgerEntry[] = [];

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
            withConverter: vi.fn(() => ({
              get: vi.fn(async () => {
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
              }),
            })),
          };
          return queryObj;
        };

        return {
          doc: vi.fn((id: string) => ({
            id,
            withConverter: vi.fn(() => ({
              set: vi.fn(async (val: unknown) => {
                if (colName === 'ledger') {
                  mockLedgerEntries.push(val as MockLedgerEntry);
                }
              }),
              get: vi.fn(async () => {
                const found = mockLedgerEntries.find((e) => e.id === id);
                return {
                  exists: found !== undefined,
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

import { appendLedger, sumByParty } from '../src/services/ledger';

describe('Ledger Service', () => {
  beforeEach(() => {
    mockLedgerEntries = [];
  });

  describe('appendLedger', () => {
    it('inserts an entry and assigns id', async () => {
      const e = await appendLedger({
        party: { type: 'advertiser', id: 'adv_a' },
        type: 'topup',
        amountIsk: 5000,
        relatedId: 'teya_tx_1',
      });
      expect(e.id).toMatch(/^ldg_[a-f0-9]{24}$/);
    });

    it('rejects zero amount', async () => {
      await expect(
        appendLedger({
          party: { type: 'advertiser', id: 'adv_a' },
          type: 'topup',
          amountIsk: 0,
          relatedId: 'x',
        }),
      ).rejects.toThrow();
    });
  });

  describe('sumByParty', () => {
    it('sums entries for a party', async () => {
      await appendLedger({
        party: { type: 'advertiser', id: 'adv_a' },
        type: 'topup',
        amountIsk: 20000,
        relatedId: 't1',
      });
      await appendLedger({
        party: { type: 'advertiser', id: 'adv_a' },
        type: 'campaign_charge',
        amountIsk: -3000,
        relatedId: 'c1',
      });
      await appendLedger({
        party: { type: 'advertiser', id: 'adv_b' },
        type: 'topup',
        amountIsk: 9999,
        relatedId: 't2',
      });

      expect(await sumByParty({ type: 'advertiser', id: 'adv_a' })).toBe(17000);
      expect(await sumByParty({ type: 'advertiser', id: 'adv_b' })).toBe(9999);
    });
  });
});
