import { describe, it, expect, vi, beforeEach } from 'vitest';

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

let mockAdvertisers: MockAdvertiser[] = [];

vi.mock('../src/lib/firebase', () => ({
  db: {
    collection: vi.fn((colName: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        withConverter: vi.fn(() => ({
          get: vi.fn(async () => {
            const adv = mockAdvertisers.find((a) => a.id === id);
            return {
              exists: adv !== undefined,
              data: () => adv,
            };
          }),
          set: vi.fn(async (data: unknown) => {
            mockAdvertisers.push(data as MockAdvertiser);
          }),
        })),
      })),
      where: vi.fn((prop: string, _op: string, val: unknown) => {
        let builder: any;
        builder = {
          limit: vi.fn(() => builder),
          withConverter: vi.fn(() => ({
            get: vi.fn(async () => {
              if (colName === 'advertisers') {
                const filtered = mockAdvertisers.filter((a) => (a as any)[prop] === val);
                return {
                  empty: filtered.length === 0,
                  docs: filtered.map((a) => ({
                    data: () => a,
                  })),
                };
              }
              return { empty: true, docs: [] };
            }),
          })),
        };
        return builder;
      }),
    })),
  },
  auth: {},
  storage: {},
}));

import {
  createAdvertiser,
  getAdvertiserByOwnerEmail,
  updateAdvertiserProfile,
} from '../src/services/advertisers';

describe('Advertiser Service', () => {
  beforeEach(() => {
    mockAdvertisers = [];
  });

  const valid = {
    ownerEmail: 'anna@blomabud.is',
    companyName: 'Blómabúð Vesturbæjar',
    kennitala: '1234567890',
    vatNumber: '123456',
  };

  describe('createAdvertiser', () => {
    it('creates advertiser with zero wallet', async () => {
      const adv = await createAdvertiser(valid);
      expect(adv.id).toMatch(/^adv_[a-f0-9]{24}$/);
      expect(adv.walletBalanceIsk).toBe(0);
      expect(adv.status).toBe('active');
    });

    it('rejects duplicate ownerEmail', async () => {
      await createAdvertiser(valid);
      await expect(createAdvertiser(valid)).rejects.toThrow(/exists/);
    });
  });

  describe('getAdvertiserByOwnerEmail', () => {
    it('returns null when missing', async () => {
      expect(await getAdvertiserByOwnerEmail('none@example.is')).toBe(null);
    });
    it('returns advertiser when present', async () => {
      const a = await createAdvertiser(valid);
      const got = await getAdvertiserByOwnerEmail('anna@blomabud.is');
      expect(got?.id).toBe(a.id);
    });
  });

  describe('updateAdvertiserProfile', () => {
    it('updates profile successfully', async () => {
      await createAdvertiser(valid);
      const updated = await updateAdvertiserProfile('anna@blomabud.is', {
        companyName: 'Nýtt blómaheiti',
        vatNumber: '654321',
        billingEmail: 'billing@blomabud.is',
      });
      expect(updated.companyName).toBe('Nýtt blómaheiti');
      expect(updated.vatNumber).toBe('654321');
      expect(updated.billingEmail).toBe('billing@blomabud.is');
      expect(updated.kennitala).toBe('1234567890'); // unchanged
    });

    it('throws when advertiser does not exist', async () => {
      await expect(
        updateAdvertiserProfile('none@example.is', {
          companyName: 'Nýtt nafn',
          vatNumber: '654321',
        }),
      ).rejects.toThrow(/No advertiser/);
    });
  });
});
