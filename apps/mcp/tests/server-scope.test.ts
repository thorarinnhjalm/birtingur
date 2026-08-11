import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiCallMock = vi.fn();
// Keep the real ApiClientError — server.ts branches on it to tell an auth
// failure apart from an outage, so a stubbed-out module would erase the
// distinction these tests exist to check.
vi.mock('../src/lib/api-client.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api-client.js')>(
    '../src/lib/api-client.js',
  );
  return { ...actual, apiCall: (...args: unknown[]) => apiCallMock(...args) };
});

import { createMcpServer } from '../src/server.js';
import { ApiClientError } from '../src/lib/api-client.js';
import { McpAuthError, UpstreamUnavailableError } from '../src/lib/errors.js';

// McpServer keeps its registered tools in a plain object (`_registeredTools`,
// private only at the TS level) — reading it directly is the simplest way to
// assert which tool sets got registered without standing up a full
// client/transport round trip.
function toolNames(server: unknown): string[] {
  return Object.keys((server as { _registeredTools: Record<string, unknown> })._registeredTools);
}

describe('createMcpServer scope-based tool registration', () => {
  beforeEach(() => {
    apiCallMock.mockReset();
  });

  it('registers only publisher tools for a publisher-scoped key', async () => {
    apiCallMock.mockResolvedValue({ scope: 'publisher', purchase: null });
    const server = await createMcpServer('ak_test_pub');
    const names = toolNames(server);

    expect(names).toContain('register_publisher');
    expect(names).toContain('create_slot');
    expect(names).toContain('check_slot_delivery');
    expect(names).not.toContain('create_campaign');
    expect(names).not.toContain('get_wallet');
    expect(names).not.toContain('list_categories');
  });

  it('registers only advertiser tools for an advertiser-scoped key', async () => {
    apiCallMock.mockResolvedValue({
      scope: 'advertiser',
      purchase: {
        enabled: true,
        monthlyCapIsk: 100_000,
        autoApproveLimitIsk: 50_000,
        monthToDateSpentIsk: 0,
        remainingCapIsk: 100_000,
      },
    });
    const server = await createMcpServer('ak_test_adv');
    const names = toolNames(server);

    expect(names).toContain('list_categories');
    expect(names).toContain('get_wallet');
    expect(names).toContain('list_creatives');
    expect(names).toContain('create_campaign');
    expect(names).toContain('get_campaign');
    expect(names).toContain('list_campaigns');
    expect(names).not.toContain('register_publisher');
    expect(names).not.toContain('create_slot');
    expect(names).not.toContain('check_slot_delivery');
  });

  it('registers both tool sets for a both-scoped key', async () => {
    apiCallMock.mockResolvedValue({ scope: 'both', purchase: null });
    const server = await createMcpServer('ak_test_both');
    const names = toolNames(server);

    expect(names).toContain('register_publisher');
    expect(names).toContain('create_slot');
    expect(names).toContain('create_campaign');
    expect(names).toContain('get_wallet');
  });

  it('registers the common tools for every scope', async () => {
    for (const scope of ['publisher', 'advertiser', 'both'] as const) {
      apiCallMock.mockResolvedValue({ scope, purchase: null });
      const names = toolNames(await createMcpServer(`ak_test_${scope}`));
      expect(names).toContain('whoami');
      expect(names).toContain('list_ad_sizes');
    }
  });

  // Regression: this used to resolve to a server with zero tools and a 200,
  // so a revoked key looked identical to a working key with no permissions.
  it('throws McpAuthError when the key is rejected (invalid/revoked)', async () => {
    apiCallMock.mockRejectedValue(new ApiClientError(401, 'unauthorized', 'Invalid API key'));
    await expect(createMcpServer('ak_bad')).rejects.toBeInstanceOf(McpAuthError);
  });

  it('throws McpAuthError on a 403 from the control-plane API', async () => {
    apiCallMock.mockRejectedValue(new ApiClientError(403, 'forbidden', 'Key revoked'));
    await expect(createMcpServer('ak_revoked')).rejects.toBeInstanceOf(McpAuthError);
  });

  // A control-plane outage is not the caller's fault — it must not be
  // reported as an auth problem, or integrators go re-issue a valid key.
  it('throws UpstreamUnavailableError when the API is down or errors', async () => {
    apiCallMock.mockRejectedValue(new ApiClientError(500, 'internal', 'boom'));
    await expect(createMcpServer('ak_test')).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('throws UpstreamUnavailableError when the API is unreachable (network error)', async () => {
    apiCallMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(createMcpServer('ak_test')).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
