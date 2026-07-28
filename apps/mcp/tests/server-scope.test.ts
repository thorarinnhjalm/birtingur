import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiCallMock = vi.fn();
vi.mock('../src/lib/api-client.js', () => ({
  apiCall: (...args: unknown[]) => apiCallMock(...args),
}));

import { createMcpServer } from '../src/server.js';

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

  it('registers no tools at all when scope resolution fails (invalid/revoked key)', async () => {
    apiCallMock.mockRejectedValue(new Error('401 unauthorized'));
    const server = await createMcpServer('ak_bad');
    const names = toolNames(server);

    expect(names).toHaveLength(0);
  });
});
