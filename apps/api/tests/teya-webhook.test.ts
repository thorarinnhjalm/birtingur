import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { getWallet } from '../src/services/wallet';
import { app } from '../src/index';

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

process.env.TEYA_WEBHOOK_SECRET = 'whsec_test';

function sign(body: string) {
  return createHmac('sha256', 'whsec_test').update(body).digest('hex');
}

describe('POST /api/teya/webhook', () => {
  beforeEach(() => {
    mockLedgerEntries = [];
    mockAdvertisers = [];
  });

  it('credits wallet on checkout.completed', async () => {
    const adv = {
      id: 'adv_123',
      ownerEmail: 'a@a.is',
      companyName: 'A',
      kennitala: '1234567890',
      vatNumber: '1',
      walletBalanceIsk: 0,
      status: 'active',
      createdAt: new Date(),
    };
    mockAdvertisers.push(adv);

    const body = JSON.stringify({
      type: 'checkout.completed',
      data: { sessionId: 'sess_1', amountIsk: 5000, metadata: { advertiserId: adv.id } },
    });

    const res = await app.request('/api/teya/webhook', {
      method: 'POST',
      headers: {
        'Teya-Signature': sign(body),
        'Content-Type': 'application/json',
      },
      body,
    });

    expect(res.status).toBe(200);
    expect((await getWallet(adv.id)).balanceIsk).toBe(5000);
  });

  it('rejects on bad signature', async () => {
    const body = JSON.stringify({
      type: 'checkout.completed',
      data: { sessionId: 's', amountIsk: 1, metadata: { advertiserId: 'x' } },
    });

    const res = await app.request('/api/teya/webhook', {
      method: 'POST',
      headers: {
        'Teya-Signature': 'bad',
        'Content-Type': 'application/json',
      },
      body,
    });

    expect(res.status).toBe(401);
  });

  it('is idempotent — same sessionId does not double-credit', async () => {
    const adv = {
      id: 'adv_123',
      ownerEmail: 'b@b.is',
      companyName: 'B',
      kennitala: '1234567890',
      vatNumber: '1',
      walletBalanceIsk: 0,
      status: 'active',
      createdAt: new Date(),
    };
    mockAdvertisers.push(adv);

    const body = JSON.stringify({
      type: 'checkout.completed',
      data: { sessionId: 'sess_idem', amountIsk: 3000, metadata: { advertiserId: adv.id } },
    });

    const headers = {
      'Teya-Signature': sign(body),
      'Content-Type': 'application/json',
    };

    const first = await app.request('/api/teya/webhook', { method: 'POST', headers, body });
    expect(first.status).toBe(200);

    const second = await app.request('/api/teya/webhook', { method: 'POST', headers, body });
    expect(second.status).toBe(200);

    expect((await getWallet(adv.id)).balanceIsk).toBe(3000);
  });
});
