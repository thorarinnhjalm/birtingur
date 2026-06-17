import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateEvents } from '../src/services/stats-aggregator';

let mockStatsDocs: Record<string, any> = {};

vi.mock('../src/lib/firebase', () => {
  return {
    db: {
      doc: vi.fn((path: string) => {
        return {
          path,
          get: vi.fn(async () => {
            return {
              exists: mockStatsDocs[path] !== undefined,
              data: () => mockStatsDocs[path],
            };
          }),
        };
      }),
      batch: vi.fn(() => {
        const batchOps: any[] = [];
        return {
          set: vi.fn((ref: any, data: any, options?: any) => {
            batchOps.push({ ref, data, options });
          }),
          commit: vi.fn(async () => {
            for (const op of batchOps) {
              const path = op.ref.path;
              const docData = mockStatsDocs[path] ?? { impressions: 0, clicks: 0, pageviews: 0 };

              const getVal = (val: any) => {
                if (val && typeof val === 'object' && 'operand' in val) {
                  return (val as any).operand;
                }
                return typeof val === 'number' ? val : 0;
              };

              for (const [key, value] of Object.entries(op.data)) {
                const inc = getVal(value);
                if (key.includes('.')) {
                  const parts = key.split('.');
                  let current = docData;
                  for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i]!;
                    if (!current[part]) {
                      current[part] = {};
                    }
                    current = current[part];
                  }
                  const lastPart = parts[parts.length - 1]!;
                  current[lastPart] = (current[lastPart] ?? 0) + inc;
                } else {
                  docData[key] = (docData[key] ?? 0) + inc;
                }
              }
              mockStatsDocs[path] = docData;
            }
          }),
        };
      }),
    },
    auth: {},
    storage: {},
  };
});

describe('aggregateEvents', () => {
  beforeEach(() => {
    mockStatsDocs = {};
  });

  it('groups impressions into hourly buckets per campaign', async () => {
    const ts = Date.UTC(2026, 5, 2, 14, 30, 0); // 2026-06-02 14:30:00 UTC
    const events = [
      {
        type: 'impression' as const,
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v1',
        ts,
      },
      {
        type: 'impression' as const,
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v2',
        ts: ts + 1000,
      },
      {
        type: 'click' as const,
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v1',
        ts: ts + 2000,
      },
    ];
    await aggregateEvents(events);

    // Check campaign hourly stats
    const cmpPath = `stats/campaigns/cmp_a/2026060214`;
    expect(mockStatsDocs[cmpPath]).toBeDefined();
    expect(mockStatsDocs[cmpPath].impressions).toBe(2);
    expect(mockStatsDocs[cmpPath].clicks).toBe(1);
    expect(mockStatsDocs[cmpPath].spendIsk).toBe(1); // Math.round((2 / 1000) * 550) = 1 ISK
    expect(mockStatsDocs[cmpPath].byPublisher).toBeDefined();
    expect(mockStatsDocs[cmpPath].byPublisher.pub_a).toBeDefined();
    expect(mockStatsDocs[cmpPath].byPublisher.pub_a.impressions).toBe(2);
    expect(mockStatsDocs[cmpPath].byPublisher.pub_a.clicks).toBe(1);
    expect(mockStatsDocs[cmpPath].byPublisher.pub_a.spendIsk).toBe(1);

    // Check publisher daily stats
    const pubPath = `stats/publishers/pub_a/20260602`;
    expect(mockStatsDocs[pubPath]).toBeDefined();
    expect(mockStatsDocs[pubPath].impressions).toBe(2);
    expect(mockStatsDocs[pubPath].clicks).toBe(1);

    // Check publisher slot daily stats
    const slotPath = `stats/publisher_slots/pub_a_s1/20260602`;
    expect(mockStatsDocs[slotPath]).toBeDefined();
    expect(mockStatsDocs[slotPath].impressions).toBe(2);
    expect(mockStatsDocs[slotPath].clicks).toBe(1);

    // Check creative hourly stats
    const crePath = `stats/creatives/cre_a/2026060214`;
    expect(mockStatsDocs[crePath]).toBeDefined();
    expect(mockStatsDocs[crePath].impressions).toBe(2);
    expect(mockStatsDocs[crePath].clicks).toBe(1);
  });

  it('groups pageviews into hourly buckets for fallback creatives', async () => {
    const ts = Date.UTC(2026, 5, 2, 14, 30, 0); // 2026-06-02 14:30:00 UTC
    const events = [
      {
        type: 'pageview' as const,
        campaignId: 'cmp_fallback',
        publisherId: 'pub_a',
        creativeId: 'cre_fallback_birtingur',
        slotId: 's1',
        advertiserId: '',
        country: 'IS',
        visitorToken: 'v1',
        ts,
      },
    ];
    await aggregateEvents(events);

    // Check creative hourly stats for fallback pageviews
    const crePath = `stats/creatives/cre_fallback_birtingur/2026060214`;
    expect(mockStatsDocs[crePath]).toBeDefined();
    expect(mockStatsDocs[crePath].pageviews).toBe(1);
  });
});
