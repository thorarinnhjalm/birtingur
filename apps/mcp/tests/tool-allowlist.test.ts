import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiCallMock = vi.fn();
vi.mock('../src/lib/api-client.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api-client.js')>(
    '../src/lib/api-client.js',
  );
  return { ...actual, apiCall: (...args: unknown[]) => apiCallMock(...args) };
});

import { createMcpServer } from '../src/server.js';

function toolNames(server: unknown): string[] {
  return Object.keys((server as { _registeredTools: Record<string, unknown> })._registeredTools);
}

/**
 * "No MCP path adds money" is a stated guarantee (CLAUDE.md, the blueprint's
 * subsystem 6): top-ups, budget increases and refunds are dashboard-only, so
 * a compromised or over-eager agent can spend at most what the wallet already
 * holds, within its purchase caps. Until now that was true by construction
 * and pinned by nothing — one convenience `top_up_wallet` tool away from
 * false.
 *
 * The pin is an exact allowlist rather than a name-pattern check: a pattern
 * ("no tool matching /topup|deposit|refund/") misses a tool named
 * `add_credit`, while an exact list makes EVERY new tool fail this test
 * until someone consciously adds it here — and that review moment, "does
 * this tool move money in?", is the entire point. When you add a tool,
 * add it to the list below with the same one-line justification style.
 */
const ALLOWED_TOOLS = [
  // common (every scope): read-only identity and reference data
  'whoami',
  'list_ad_sizes',
  // publisher: slot/config management and reads — no money movement
  'register_publisher',
  'create_slot',
  'update_slot',
  'list_my_slots',
  'get_snippet_code',
  'get_react_component',
  'get_stats',
  'set_content_policy',
  'get_changelog',
  'check_slot_delivery',
  // advertiser: reads, plus create_campaign which SPENDS existing wallet
  // funds behind purchase.enabled + monthly cap + auto-approve limit — it
  // never adds funds
  'list_categories',
  'list_campaigns',
  'get_campaign',
  'get_wallet',
  'list_creatives',
  'create_campaign',
].sort();

describe('MCP tool allowlist (no tool may add funds)', () => {
  beforeEach(() => {
    apiCallMock.mockReset();
  });

  it('a both-scoped key registers exactly the allowlisted tools', async () => {
    apiCallMock.mockResolvedValue({ scope: 'both', purchase: { enabled: true } });
    const server = await createMcpServer('ak_test_both');

    expect(toolNames(server).sort()).toEqual(ALLOWED_TOOLS);
  });

  it('no registered tool name suggests money-in', async () => {
    // Belt to the allowlist's braces: even a consciously-added tool must not
    // carry a money-in name without this test being edited too.
    apiCallMock.mockResolvedValue({ scope: 'both', purchase: { enabled: true } });
    const server = await createMcpServer('ak_test_both');

    const moneyIn = /top[_-]?up|deposit|refund|add[_-]?(funds|credit|balance)|transfer/i;
    expect(toolNames(server).filter((n) => moneyIn.test(n))).toEqual([]);
  });
});
