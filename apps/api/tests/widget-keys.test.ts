import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  issueWidgetKey,
  verifyWidgetKey,
  revokeWidgetKey,
  getWidgetKeyByTargetId,
  getOrCreateWidgetKey,
} from '../src/services/widget-keys.js';
import { widgetsRouter } from '../src/routes/widgets.js';
import { db } from '../src/lib/firebase.js';
import { handleError } from '../src/lib/errors';

// Mock getPublisherStats and getCampaignStats services
vi.mock('../src/services/publisher-stats.js', () => ({
  getPublisherStats: async (id: string, timeframe: number) => ({
    impressions: 1000,
    clicks: 10,
    spendIsk: 280,
    history: [],
  }),
}));


vi.mock('../src/services/campaign-stats.js', () => ({
  getCampaignStats: async (id: string) => ({
    impressions: 500,
    clicks: 5,
    hours: [],
  }),
}));

vi.mock('../src/lib/firebase.js', () => {
  const store: Record<string, any> = {};
  return {
    db: {
      collection: (col: string) => ({
        doc: (id: string) => ({
          set: async (val: any) => {
            store[id] = val;
            return {};
          },
          get: async () => ({
            exists: !!store[id],
            data: () => store[id],
          }),
          update: async (val: any) => {
            if (store[id]) {
              store[id] = { ...store[id], ...val };
            }
            return {};
          },
        }),
        where: (field: string, op: string, val: any) => {
          // simple mocked filter
          const matches = Object.values(store).filter(
            (item: any) => item[field] === val && item.revoked === false,
          );
          return {
            limit: (n: number) => ({
              get: async () => ({
                empty: matches.length === 0,
                docs: matches.slice(0, n).map((m) => ({
                  data: () => m,
                })),
              }),
            }),
          };
        },
      }),
    },
    auth: {
      verifyIdToken: vi.fn(),
    },
  };
});

describe('Widget Keys Auth & Endpoints', () => {
  let app: Hono<any>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = new Hono();
    app.onError(handleError);
    app.route('/v1/widgets', widgetsRouter);
  });

  it('can issue a valid widget key and verify it', async () => {
    const email = 'publisher@example.is';
    const record = await issueWidgetKey(email, 'publisher', 'pub_123');

    expect(record.key.startsWith('wk_publisher_')).toBe(true);
    expect(record.targetId).toBe('pub_123');

    const verified = await verifyWidgetKey(record.key);
    expect(verified).not.toBeNull();
    expect(verified?.ownerEmail).toBe(email);
    expect(verified?.type).toBe('publisher');
  });

  it('fails verification for revoked widget keys', async () => {
    const email = 'publisher@example.is';
    const record = await issueWidgetKey(email, 'publisher', 'pub_123');

    await revokeWidgetKey(record.id);

    const verified = await verifyWidgetKey(record.key);
    expect(verified).toBeNull();
  });

  it('allows read access to stats with valid widget key bearer token', async () => {
    const record = await issueWidgetKey('pub@example.is', 'publisher', 'pub_123');

    const res = await app.request('/v1/widgets/publisher/stats', {
      headers: {
        Authorization: `Bearer ${record.key}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.impressions).toBe(1000);
  });

  it('blocks stats access for a campaign-scoped key on a publisher stats route', async () => {
    const record = await issueWidgetKey('adv@example.is', 'campaign', 'camp_123');

    const res = await app.request('/v1/widgets/publisher/stats', {
      headers: {
        Authorization: `Bearer ${record.key}`,
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN');
  });


  it('allows campaign stats access with campaign scoped key', async () => {
    const record = await issueWidgetKey('adv@example.is', 'campaign', 'camp_123');

    const res = await app.request('/v1/widgets/campaign/stats', {
      headers: {
        Authorization: `Bearer ${record.key}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.impressions).toBe(500);
  });
});
