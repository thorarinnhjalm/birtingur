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

interface MockLedgerEntry {
  id: string;
  party: { type: 'advertiser' | 'publisher' | 'platform'; id: string };
  type: string;
  amountIsk: number;
  relatedId: string;
  createdAt: Date;
}

let mockAdvertisers: MockAdvertiser[] = [];
let mockLedgerEntries: MockLedgerEntry[] = [];

vi.mock('../src/lib/firebase', () => {
  return {
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === 'admin-token') {
          return { uid: 'u-admin', email: 'admin@a.is', admin: true };
        } else if (token === 'user-token') {
          return { uid: 'u-user', email: 'user@a.is' };
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
              if (colName === 'advertisers') {
                filtered = [...mockAdvertisers];
              } else if (colName === 'ledger') {
                filtered = [...mockLedgerEntries];
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
            set: queryObj.set,
          }));

          return queryObj;
        };

        const docObj = (id: string) => {
          const docGet = async () => {
            let data: Record<string, unknown> | null = null;
            if (colName === 'advertisers') {
              data =
                (mockAdvertisers.find((a) => a.id === id) as unknown as Record<string, unknown>) ||
                null;
            } else if (colName === 'ledger') {
              data =
                (mockLedgerEntries.find((l) => l.id === id) as unknown as Record<
                  string,
                  unknown
                >) || null;
            }
            return {
              exists: data !== undefined && data !== null,
              data: () => data,
            };
          };

          const docUpdate = async (fields: unknown) => {
            if (colName === 'advertisers') {
              const found = mockAdvertisers.find((a) => a.id === id);
              if (found) {
                Object.assign(found, fields as Partial<MockAdvertiser>);
              }
            }
          };

          const docSet = async (val: unknown) => {
            if (colName === 'advertisers') {
              const idx = mockAdvertisers.findIndex((a) => a.id === id);
              if (idx !== -1) mockAdvertisers[idx] = val as MockAdvertiser;
              else mockAdvertisers.push(val as MockAdvertiser);
            } else if (colName === 'ledger') {
              mockLedgerEntries.push(val as MockLedgerEntry);
            }
          };

          const ref: any = {
            id,
            get: vi.fn(docGet),
            update: vi.fn(docUpdate),
            set: vi.fn(docSet),
            withConverter: vi.fn(() => ({
              get: vi.fn(docGet),
              set: vi.fn(docSet),
            })),
          };

          return ref;
        };

        return {
          doc: vi.fn((id: string) => docObj(id)),
          ...createQuery(),
        };
      }),
    },
    storage: {},
  };
});

describe('Admin Entities top-up route', () => {
  beforeEach(() => {
    mockAdvertisers = [];
    mockLedgerEntries = [];
    vi.clearAllMocks();
  });

  it('fails if unauthorized (no token)', async () => {
    const res = await app.request('/v1/admin/entities/advertisers/adv_123/topup', {
      method: 'POST',
      body: JSON.stringify({ amountIsk: 10000 }),
    });
    expect(res.status).toBe(401);
  });

  it('fails if forbidden (non-admin token)', async () => {
    const res = await app.request('/v1/admin/entities/advertisers/adv_123/topup', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amountIsk: 10000 }),
    });
    expect(res.status).toBe(403);
  });

  it('fails if amount is invalid or negative', async () => {
    const res = await app.request('/v1/admin/entities/advertisers/adv_123/topup', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amountIsk: -50 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('amountIsk must be a positive number');
  });

  it('succeeds, updates advertiser wallet Balance, and appends to ledger', async () => {
    // Seed mock advertiser
    mockAdvertisers.push({
      id: 'adv_123',
      ownerEmail: 'adv@advertiser.is',
      companyName: 'Bókabúðin',
      kennitala: '1234567890',
      vatNumber: '12345',
      walletBalanceIsk: 0,
      status: 'active',
      createdAt: new Date(),
    });

    const res = await app.request('/v1/admin/entities/advertisers/adv_123/topup', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amountIsk: 25000 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.txnId).toMatch(/^admin_grant_/);

    // Verify advertiser balance in memory was updated
    const advertiser = mockAdvertisers.find((a) => a.id === 'adv_123');
    expect(advertiser!.walletBalanceIsk).toBe(25000);

    // Verify ledger entry was created
    const ledgerEntry = mockLedgerEntries.find((l) => l.relatedId === body.txnId);
    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry!.type).toBe('topup');
    expect(ledgerEntry!.amountIsk).toBe(25000);
    expect(ledgerEntry!.party).toEqual({ type: 'advertiser', id: 'adv_123' });
  });
});
