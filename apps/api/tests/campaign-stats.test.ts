import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDocs: Array<{ id: string; data: () => any }> = [];

vi.mock('../src/lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({ get: vi.fn(async () => ({ docs: mockDocs })) })),
  },
}));

vi.mock('../src/services/publishers', () => ({
  getPublisherById: vi.fn(async (id: string) =>
    id === 'pub_a' ? { id, displayName: 'Pizzadeig', domain: 'pizzadeig.is' } : null,
  ),
}));

vi.mock('../src/services/creatives', () => ({
  getCreative: vi.fn(async (id: string) =>
    id === 'cre_1'
      ? { id, imageUrl: 'https://cdn.example/cre_1.png', width: 300, height: 250 }
      : null,
  ),
}));

import { getCampaignStats, UNATTRIBUTED_CREATIVE_ID } from '../src/services/campaign-stats';

function currentHourKey(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    String(d.getUTCHours()).padStart(2, '0')
  );
}

beforeEach(() => {
  mockDocs.length = 0;
});

describe('getCampaignStats byCreative', () => {
  it('aggregates per-creative stats and enriches with size label and image', async () => {
    mockDocs.push({
      id: currentHourKey(),
      data: () => ({
        impressions: 10,
        clicks: 2,
        byPublisher: { pub_a: { impressions: 10, clicks: 2 } },
        byPublisherCreative: { pub_a: { cre_1: { impressions: 10, clicks: 2 } } },
      }),
    });

    const stats = await getCampaignStats('cmp_1', 24);
    const pub = stats.byPublisher['pub_a']!;
    expect(pub.byCreative).toEqual({
      cre_1: {
        impressions: 10,
        clicks: 2,
        label: '300×250',
        imageUrl: 'https://cdn.example/cre_1.png',
      },
    });
  });

  it('adds an unattributed remainder when older hours lack the field', async () => {
    const hk = currentHourKey();
    mockDocs.push({
      id: hk,
      data: () => ({
        impressions: 8,
        clicks: 1,
        byPublisher: { pub_a: { impressions: 8, clicks: 1 } },
        byPublisherCreative: { pub_a: { cre_1: { impressions: 5, clicks: 1 } } },
      }),
    });

    const stats = await getCampaignStats('cmp_1', 24);
    const byCreative = stats.byPublisher['pub_a']!.byCreative!;
    expect(byCreative[UNATTRIBUTED_CREATIVE_ID]).toEqual({
      impressions: 3,
      clicks: 0,
      label: 'Eldri gögn (fyrir sundurliðun)',
      imageUrl: null,
    });
  });

  it('falls back to the creative id as label when the creative is deleted', async () => {
    mockDocs.push({
      id: currentHourKey(),
      data: () => ({
        impressions: 4,
        clicks: 0,
        byPublisher: { pub_a: { impressions: 4, clicks: 0 } },
        byPublisherCreative: { pub_a: { cre_gone: { impressions: 4, clicks: 0 } } },
      }),
    });

    const stats = await getCampaignStats('cmp_1', 24);
    const byCreative = stats.byPublisher['pub_a']!.byCreative!;
    expect(byCreative['cre_gone']!.label).toBe('cre_gone');
    expect(byCreative['cre_gone']!.imageUrl).toBeNull();
  });

  it('omits byCreative entirely for docs with no byPublisherCreative at all', async () => {
    mockDocs.push({
      id: currentHourKey(),
      data: () => ({
        impressions: 8,
        clicks: 1,
        byPublisher: { pub_a: { impressions: 8, clicks: 1 } },
      }),
    });

    const stats = await getCampaignStats('cmp_1', 24);
    expect(stats.byPublisher['pub_a']!.byCreative).toBeUndefined();
  });
});
