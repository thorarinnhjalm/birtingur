import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/index';
import type * as InventoryModule from '../src/services/inventory';

const mockGetCategorySizeForecast = vi.fn(async (_categories: string[]) => [
  { width: 300, height: 250, slotCount: 3, forecastShare: 0.6 },
  { width: 728, height: 90, slotCount: 1, forecastShare: 0.4 },
]);

vi.mock('../src/services/inventory', async (importOriginal) => {
  const original = await importOriginal<typeof InventoryModule>();
  return {
    ...original,
    getCategorySizeForecast: (categories: string[]) => mockGetCategorySizeForecast(categories),
  };
});

vi.mock('../src/services/api-keys', () => ({
  verifyApiKey: vi.fn(async (key: string) => {
    if (key === 'ak_advertiser_key') {
      return { id: 'ak_advertiser_key', ownerEmail: 'adv@example.is', scope: 'advertiser' };
    }
    if (key === 'ak_publisher_key') {
      return { id: 'ak_publisher_key', ownerEmail: 'pub@example.is', scope: 'publisher' };
    }
    return null;
  }),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'valid-token') {
        return { uid: 'user-123', email: 'user@example.is', email_verified: true };
      }
      throw new Error('Invalid token');
    }),
  },
  db: { collection: vi.fn(), doc: vi.fn() },
  storage: {},
}));

describe('GET /v1/categories/sizes', () => {
  beforeEach(() => {
    mockGetCategorySizeForecast.mockClear();
  });

  it('401s when unauthorized', async () => {
    const res = await app.request('/v1/categories/sizes?categories=matur');
    expect(res.status).toBe(401);
    expect(mockGetCategorySizeForecast).not.toHaveBeenCalled();
  });

  it('400s when the categories query parameter is missing', async () => {
    const res = await app.request('/v1/categories/sizes', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(400);
    expect(mockGetCategorySizeForecast).not.toHaveBeenCalled();
  });

  it('400s when categories is present but empty', async () => {
    const res = await app.request('/v1/categories/sizes?categories=', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(400);
    expect(mockGetCategorySizeForecast).not.toHaveBeenCalled();
  });

  it('400s on an unknown category slug, without calling the service', async () => {
    const res = await app.request('/v1/categories/sizes?categories=matur,not_a_real_category', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(400);
    expect(mockGetCategorySizeForecast).not.toHaveBeenCalled();
  });

  it('returns { sizes } for valid category slugs', async () => {
    const res = await app.request('/v1/categories/sizes?categories=matur,ferdalog', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sizes).toHaveLength(2);
    expect(body.sizes[0]).toMatchObject({
      width: 300,
      height: 250,
      slotCount: 3,
      forecastShare: 0.6,
    });
    expect(mockGetCategorySizeForecast).toHaveBeenCalledWith(['matur', 'ferdalog']);
  });

  it('trims whitespace around comma-separated category slugs', async () => {
    const res = await app.request(
      `/v1/categories/sizes?categories=${encodeURIComponent('matur , ferdalog')}`,
      { headers: { Authorization: 'Bearer valid-token' } },
    );
    expect(res.status).toBe(200);
    expect(mockGetCategorySizeForecast).toHaveBeenCalledWith(['matur', 'ferdalog']);
  });

  it('allows an advertiser-scoped ak_ key (read-only)', async () => {
    const res = await app.request('/v1/categories/sizes?categories=matur', {
      headers: { Authorization: 'Bearer ak_advertiser_key' },
    });
    expect(res.status).toBe(200);
  });

  it('403s a publisher-scoped ak_ key (wrong scope for an advertiser-only insight)', async () => {
    const res = await app.request('/v1/categories/sizes?categories=matur', {
      headers: { Authorization: 'Bearer ak_publisher_key' },
    });
    expect(res.status).toBe(403);
  });
});
