import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCreative,
  listCreativesForAdvertiser,
  updateCreative,
  deleteCreative,
} from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';

interface MockCreative {
  id: string;
  advertiserId: string;
  imageUrl: string;
  width: number;
  height: number;
  clickUrl: string;
  ocrTextHint?: string;
  reviewStatus: string;
  reviewLog: Array<{
    at: Date;
    by: string;
    action: string;
    reason?: string;
  }>;
  autoScanResult?: {
    nsfwScore: number;
    blockedTerms: string[];
    category: string;
    confidence: number;
  };
}

let mockCreatives: MockCreative[] = [];
let mockCampaigns: any[] = [];

vi.mock('../src/lib/firebase', () => ({
  db: {
    collection: vi.fn((colName: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        delete: vi.fn(async () => {
          if (colName === 'creatives') {
            mockCreatives = mockCreatives.filter((c) => c.id !== id);
          }
        }),
        withConverter: vi.fn(() => ({
          get: vi.fn(async () => {
            const cre = mockCreatives.find((c) => c.id === id);
            return {
              exists: cre !== undefined,
              data: () => cre,
            };
          }),
          set: vi.fn(async (data: unknown) => {
            if (colName === 'creatives') {
              const idx = mockCreatives.findIndex((c) => c.id === id);
              if (idx !== -1) {
                mockCreatives[idx] = data as MockCreative;
              } else {
                mockCreatives.push(data as MockCreative);
              }
            }
          }),
        })),
      })),
      where: vi.fn((prop: string, op: string, val: unknown) => {
        const getFn = async () => {
          if (colName === 'creatives') {
            const filtered = mockCreatives.filter((c) => (c as any)[prop] === val);
            return {
              docs: filtered.map((c) => ({
                data: () => c,
              })),
            };
          }
          if (colName === 'campaigns') {
            const filtered = mockCampaigns.filter((c) => {
              if (op === 'array-contains') {
                return Array.isArray(c[prop]) && c[prop].includes(val);
              }
              return (c as any)[prop] === val;
            });
            return {
              docs: filtered.map((c) => ({
                data: () => c,
              })),
            };
          }
          return { docs: [] };
        };

        const builder = {
          get: getFn,
          withConverter: vi.fn(() => ({
            get: getFn,
          })),
        };
        return builder;
      }),
    })),
  },
  auth: {},
  storage: {},
}));

vi.mock('./approvals.js', () => ({
  propagateCreativeChange: vi.fn(async () => {}),
}));

describe('Creative Service', () => {
  beforeEach(() => {
    mockCreatives = [];
    mockCampaigns = [];
  });

  it('auto-approves clean creative', async () => {
    const c = await createCreative(
      'adv_123',
      {
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is',
        ocrTextHint: 'Sumartilboð',
      },
      new StubAutoScanner(),
    );
    expect(c.reviewStatus).toBe('auto_approved');
    expect(c.reviewLog.length).toBeGreaterThan(0);
    expect(c.reviewLog[0]!.by).toBe('auto');
    expect(c.reviewLog[0]!.action).toBe('approved');
  });

  it('rejects creative with blocked terms', async () => {
    const c = await createCreative(
      'adv_123',
      {
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://example.is',
        ocrTextHint: 'casino bonus',
      },
      new StubAutoScanner(),
    );
    expect(c.reviewStatus).toBe('rejected');
    expect(c.reviewLog[0]!.action).toBe('rejected');
  });

  it('returns creatives for advertiser only', async () => {
    await createCreative(
      'adv_123',
      {
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is',
      },
      new StubAutoScanner(),
    );
    const list = await listCreativesForAdvertiser('adv_123');
    expect(list).toHaveLength(1);
    expect(list[0]!.advertiserId).toBe('adv_123');
  });

  describe('updateCreative', () => {
    it('updates creative clickUrl and triggers scanner', async () => {
      mockCreatives.push({
        id: 'crt_1',
        advertiserId: 'adv_123',
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://old.is',
        reviewStatus: 'auto_approved',
        reviewLog: [],
      });

      const scanner = new StubAutoScanner();
      const updated = await updateCreative(
        'crt_1',
        'adv_123',
        {
          clickUrl: 'https://new.is',
          ocrTextHint: 'Nýtt tilboð',
        },
        scanner,
      );

      expect(updated.clickUrl).toBe('https://new.is');
      expect(updated.ocrTextHint).toBe('Nýtt tilboð');
      expect(updated.reviewStatus).toBe('auto_approved');
    });

    it('fails if advertiserId mismatch', async () => {
      mockCreatives.push({
        id: 'crt_2',
        advertiserId: 'adv_123',
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://old.is',
        reviewStatus: 'auto_approved',
        reviewLog: [],
      });

      const scanner = new StubAutoScanner();
      await expect(
        updateCreative(
          'crt_2',
          'adv_999',
          {
            clickUrl: 'https://new.is',
          },
          scanner,
        ),
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('deleteCreative', () => {
    it('deletes creative successfully if not in use by active campaigns', async () => {
      mockCreatives.push({
        id: 'crt_3',
        advertiserId: 'adv_123',
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://example.is',
        reviewStatus: 'auto_approved',
        reviewLog: [],
      });

      mockCampaigns = [];

      await deleteCreative('crt_3', 'adv_123');
      const index = mockCreatives.findIndex((c) => c.id === 'crt_3');
      expect(index).toBe(-1);
    });

    it('fails to delete if used by active campaign', async () => {
      mockCreatives.push({
        id: 'crt_4',
        advertiserId: 'adv_123',
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://example.is',
        reviewStatus: 'auto_approved',
        reviewLog: [],
      });

      mockCampaigns = [
        {
          id: 'cmp_1',
          creativeIds: ['crt_4'],
          status: 'active',
        },
      ];

      await expect(deleteCreative('crt_4', 'adv_123')).rejects.toThrow(
        'Ekki er hægt að eyða auglýsingu sem er í notkun í virkri herferð',
      );
    });
  });
});
