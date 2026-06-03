import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreative, listCreativesForAdvertiser } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';

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
  autoScanResult?: {
    nsfwScore: number;
    blockedTerms: string[];
    category: string;
    confidence: number;
  };
}

let mockCreatives: MockCreative[] = [];

vi.mock('../src/lib/firebase', () => ({
  db: {
    collection: vi.fn((colName: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        withConverter: vi.fn(() => ({
          get: vi.fn(async () => {
            const cre = mockCreatives.find((c) => c.id === id);
            return {
              exists: cre !== undefined,
              data: () => cre,
            };
          }),
          set: vi.fn(async (data: unknown) => {
            mockCreatives.push(data as MockCreative);
          }),
        })),
      })),
      where: vi.fn((prop: string, _op: string, val: unknown) => {
        const builder = {
          withConverter: vi.fn(() => ({
            get: vi.fn(async () => {
              if (colName === 'creatives') {
                const filtered = mockCreatives.filter((c) => (c as Record<string, unknown>)[prop] === val);
                return {
                  docs: filtered.map((c) => ({
                    data: () => c,
                  })),
                };
              }
              return { docs: [] };
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

describe('Creative Service', () => {
  beforeEach(() => {
    mockCreatives = [];
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
      new StubAutoScanner()
    );
    expect(c.reviewStatus).toBe('auto_approved');
    expect(c.reviewLog.length).toBeGreaterThan(0);
    expect(c.reviewLog[0].by).toBe('auto');
    expect(c.reviewLog[0].action).toBe('approved');
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
      new StubAutoScanner()
    );
    expect(c.reviewStatus).toBe('rejected');
    expect(c.reviewLog[0].action).toBe('rejected');
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
      new StubAutoScanner()
    );
    const list = await listCreativesForAdvertiser('adv_123');
    expect(list).toHaveLength(1);
    expect(list[0].advertiserId).toBe('adv_123');
  });
});
