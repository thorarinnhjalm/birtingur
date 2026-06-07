import { vi, describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';

vi.mock('../src/lib/firebase', () => {
  return {
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === 'valid-token') {
          return { uid: 'user-123', email: 'user@example.is' };
        }
        throw new Error('Invalid token');
      }),
    },
    db: {
      collection: vi.fn(),
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({ exists: false, data: () => null })),
      })),
    },
    storage: {},
  };
});

describe('GET /v1/categories/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if unauthorized', async () => {
    const res = await app.request('/v1/categories/content');
    expect(res.status).toBe(401);
  });

  it('returns the allowed content-category list (bare array)', async () => {
    const res = await app.request('/v1/categories/content', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toContain('taekni');
  });
});
