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
// Advertiser ids for which the mocked advertisers-collection `update` (i.e.
// syncMirror's write) throws — used to prove chargeCampaign does not reject
// when the mirror sync fails after the ledger charge has already landed.
let failMirrorSyncFor = new Set<string>();

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
                  id: item.id,
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
                  } else if (filter.prop === 'ownerEmail') {
                    filtered = filtered.filter((e: any) => e.ownerEmail === filter.val);
                  }
                }
                return {
                  empty: filtered.length === 0,
                  docs: filtered.map((item) => ({
                    id: (item as any).id,
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
                if (failMirrorSyncFor.has(id)) {
                  throw new Error('mirror sync unavailable');
                }
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
    auth: {
      verifyIdToken: vi.fn(),
    },
    storage: {},
  };
});

import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createAdvertiser, getAdvertiserById } from '../src/services/advertisers';
import {
  topUp,
  getWallet,
  chargeCampaign,
  refundCampaign,
  creditPublisher,
} from '../src/services/wallet';
import { DEFAULT_PLATFORM_FEE_PERCENT, publisherNetIsk } from '@ada/shared';

describe('Wallet Service', () => {
  beforeEach(() => {
    mockLedgerEntries = [];
    mockAdvertisers = [];
    failMirrorSyncFor = new Set();
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

    it('resolves — and leaves exactly one ledger entry — when the wallet mirror sync fails after the charge lands', async () => {
      // The ledger append is the money-moving write; syncMirror only
      // refreshes a derived read cache. If chargeCampaign rejected here,
      // a caller like services/accrual.ts would treat the charge as never
      // having happened and retry it, double-billing the advertiser.
      const a = await seedAdv();
      await topUp(a.id, 10000, 't'); // let topUp's own mirror sync succeed first
      failMirrorSyncFor.add(a.id);

      await expect(chargeCampaign(a.id, 'cmp_mirror_fail', 3000)).resolves.toBeUndefined();

      const chargeEntries = mockLedgerEntries.filter(
        (e) =>
          e.party.id === a.id && e.type === 'campaign_charge' && e.relatedId === 'cmp_mirror_fail',
      );
      expect(chargeEntries).toHaveLength(1);
      // The ledger (source of truth) reflects the charge even though the
      // mirror write failed — getWallet reads from the ledger, not the mirror.
      expect((await getWallet(a.id)).balanceIsk).toBe(7000);
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

    /**
     * `publisherNetIsk` is what every screen and every agent reports as the
     * publisher's earnings. This is the only test that ties it to the money
     * actually moved, rather than to a copy of its own arithmetic — a shared
     * test that re-derives the formula proves determinism and nothing else.
     *
     * The values include grosses where the fee lands near a half króna, which
     * is where `gross - round(gross * fee)` and `round(gross * (1 - fee))` come
     * apart at other fee rates.
     */
    it('is exactly what the ledger credits, across a range of gross amounts', async () => {
      const { sumByParty } = await import('../src/services/ledger');
      for (const gross of [1, 3, 5, 7, 550, 1001, 12_345]) {
        const publisherId = `pub_parity_${gross}`;
        await creditPublisher(publisherId, 'cmp_parity', gross);

        const credited = await sumByParty({ type: 'publisher', id: publisherId });
        expect(credited).toBe(publisherNetIsk(gross));
      }
    });
  });
});

describe('Wallet API Router', () => {
  beforeEach(() => {
    mockLedgerEntries = [];
    mockAdvertisers = [];
    failMirrorSyncFor = new Set();
    vi.clearAllMocks();
  });

  it('GET /v1/advertisers/me/wallet/transactions returns 401 when unauthenticated', async () => {
    vi.mocked(auth.verifyIdToken).mockRejectedValue(new Error('Invalid token'));
    const res = await app.request('/v1/advertisers/me/wallet/transactions', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/advertisers/me/wallet/transactions returns 404 when advertiser not found', async () => {
    vi.mocked(auth.verifyIdToken).mockResolvedValue({
      uid: 'u1',
      email: 'no-advertiser@example.is',
      email_verified: true,
    } as unknown as DecodedIdToken);

    const res = await app.request('/v1/advertisers/me/wallet/transactions', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(404);
  });

  it('GET /v1/advertisers/me/wallet/transactions returns transactions list for active advertiser', async () => {
    vi.mocked(auth.verifyIdToken).mockResolvedValue({
      uid: 'u1',
      email: 'advertiser@example.is',
      email_verified: true,
    } as unknown as DecodedIdToken);

    // Seed advertiser
    const adv = {
      id: 'adv_123',
      ownerEmail: 'advertiser@example.is',
      companyName: 'Bókaverzlun',
      kennitala: '1234567890',
      vatNumber: '111',
      walletBalanceIsk: 0,
      status: 'active',
      createdAt: new Date(),
    };
    mockAdvertisers.push(adv);

    // Seed ledger entries
    mockLedgerEntries.push({
      id: 'led_1',
      party: { type: 'advertiser', id: 'adv_123' },
      type: 'topup',
      amountIsk: 10000,
      relatedId: 'teya_sess_1',
      createdAt: { toDate: () => new Date('2026-06-10T10:00:00Z') } as any,
    });

    mockLedgerEntries.push({
      id: 'led_2',
      party: { type: 'advertiser', id: 'adv_123' },
      type: 'refund',
      amountIsk: 2000,
      relatedId: 'campaign_refund_1',
      createdAt: { toDate: () => new Date('2026-06-11T12:00:00Z') } as any,
    });

    // A campaign_spend entry that should be filtered out
    mockLedgerEntries.push({
      id: 'led_3',
      party: { type: 'advertiser', id: 'adv_123' },
      type: 'campaign_spend',
      amountIsk: -3000,
      relatedId: 'campaign_1',
      createdAt: { toDate: () => new Date('2026-06-12T09:00:00Z') } as any,
    });

    const res = await app.request('/v1/advertisers/me/wallet/transactions', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    // Ordered descending by createdAt
    expect(body[0].id).toBe('led_2');
    expect(body[0].type).toBe('refund');
    expect(body[0].amountIsk).toBe(2000);
    expect(body[1].id).toBe('led_1');
    expect(body[1].type).toBe('topup');
    expect(body[1].amountIsk).toBe(10000);
  });
});
