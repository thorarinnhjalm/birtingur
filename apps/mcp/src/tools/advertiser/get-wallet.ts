import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

interface ApiKeyMeResponse {
  purchase: {
    enabled: boolean;
    monthlyCapIsk: number;
    autoApproveLimitIsk: number;
    monthToDateSpentIsk: number;
    remainingCapIsk: number;
  } | null;
}

export function registerGetWallet(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_wallet',
    {
      title: 'Get wallet balance and purchase limits',
      description:
        "Returns the advertiser's wallet balance (total, committed to other campaigns, and available), plus this API key's purchase guardrails: whether purchase is enabled, the monthly agent-spend cap, the auto-approve threshold (campaigns above it need the owner's approval before they serve), month-to-date agent spend, and remaining headroom under the monthly cap. There is no tool to top up the wallet — top-ups are dashboard-only, by design, so an agent can only allocate funds its owner already deposited.",
      inputSchema: {},
    },
    async () => {
      const [wallet, keyInfo] = await Promise.all([
        apiCall<Record<string, unknown>>('/v1/advertisers/me/wallet', { apiKey }),
        apiCall<ApiKeyMeResponse>('/v1/api-keys/me', { apiKey }),
      ]);
      const merged = { ...wallet, purchase: keyInfo.purchase };
      return { content: [{ type: 'text' as const, text: JSON.stringify(merged) }] };
    },
  );
}
