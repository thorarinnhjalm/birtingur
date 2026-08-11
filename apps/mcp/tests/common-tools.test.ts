import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IAB_STANDARD_SIZES, FLAT_CPM_ISK } from '@ada/shared';

const apiCallMock = vi.fn();
vi.mock('../src/lib/api-client.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api-client.js')>(
    '../src/lib/api-client.js',
  );
  return { ...actual, apiCall: (...args: unknown[]) => apiCallMock(...args) };
});

import { createMcpServer } from '../src/server.js';
import { ApiClientError } from '../src/lib/api-client.js';

type Handler = (args: unknown, extra: unknown) => Promise<{ content: { text: string }[] }>;

async function callTool(server: unknown, name: string) {
  const tool = (server as { _registeredTools: Record<string, { handler: Handler }> })
    ._registeredTools[name];
  if (!tool) throw new Error(`tool ${name} not registered`);
  const res = await tool.handler({}, {});
  return JSON.parse(res.content[0]!.text);
}

describe('whoami', () => {
  beforeEach(() => {
    apiCallMock.mockReset();
  });

  it('resolves the publisher id an agent needs before creating slots', async () => {
    const me = {
      email: 'ritstjori@matarbloggid.is',
      admin: false,
      apiKeyId: 'key_1',
      scope: 'publisher',
      purchase: null,
    };
    apiCallMock.mockImplementation((path: string) => {
      if (path === '/v1/api-keys/me') return Promise.resolve(me);
      if (path === '/v1/publishers/me')
        return Promise.resolve({
          id: 'pub_abc',
          domain: 'matarbloggid.is',
          displayName: 'Matarbloggið',
          categories: ['matur'],
          status: 'active',
        });
      throw new Error(`unexpected path ${path}`);
    });

    const out = await callTool(await createMcpServer('ak_pub'), 'whoami');

    expect(out.publisher.id).toBe('pub_abc');
    expect(out.publisher.categories).toEqual(['matur']);
    expect(out.scope).toBe('publisher');
    // An advertiser profile is never fetched for a publisher-scoped key.
    expect(out.advertiser).toBeNull();
    expect(out.nextSteps.join(' ')).toContain('pub_abc');
  });

  it('reports a missing publisher profile as a next step instead of failing', async () => {
    apiCallMock.mockImplementation((path: string) => {
      if (path === '/v1/api-keys/me')
        return Promise.resolve({
          email: 'nyr@vefur.is',
          admin: false,
          scope: 'publisher',
          purchase: null,
        });
      if (path === '/v1/publishers/me')
        return Promise.reject(new ApiClientError(404, 'NOT_FOUND', 'Publisher profile not found'));
      throw new Error(`unexpected path ${path}`);
    });

    const out = await callTool(await createMcpServer('ak_pub'), 'whoami');

    expect(out.publisher).toBeNull();
    expect(out.nextSteps.join(' ')).toContain('register_publisher');
  });

  it('surfaces purchase limits for an advertiser-scoped key', async () => {
    const purchase = {
      enabled: true,
      monthlyCapIsk: 200_000,
      autoApproveLimitIsk: 50_000,
      monthToDateSpentIsk: 30_000,
      remainingCapIsk: 170_000,
    };
    apiCallMock.mockImplementation((path: string) => {
      if (path === '/v1/api-keys/me')
        return Promise.resolve({ email: 'a@b.is', admin: false, scope: 'advertiser', purchase });
      if (path === '/v1/advertisers/me') return Promise.resolve({ id: 'adv_1', name: 'Bakarí' });
      throw new Error(`unexpected path ${path}`);
    });

    const out = await callTool(await createMcpServer('ak_adv'), 'whoami');

    expect(out.advertiser.id).toBe('adv_1');
    expect(out.purchase.remainingCapIsk).toBe(170_000);
    expect(out.publisher).toBeNull();
  });
});

describe('list_ad_sizes', () => {
  beforeEach(() => {
    apiCallMock.mockReset();
    apiCallMock.mockResolvedValue({ scope: 'publisher', purchase: null });
  });

  it('returns exactly the IAB sizes createSlot accepts, plus the locked CPM', async () => {
    const out = await callTool(await createMcpServer('ak_pub'), 'list_ad_sizes');

    expect(out.sizes).toHaveLength(IAB_STANDARD_SIZES.length);
    expect(out.sizes.map((s: { key: string }) => s.key)).toEqual(
      IAB_STANDARD_SIZES.map((s) => `${s.width}x${s.height}`),
    );
    expect(out.cpmIsk).toBe(FLAT_CPM_ISK);
  });
});
