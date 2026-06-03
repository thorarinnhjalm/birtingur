import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

export function registerWalletBalance(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_wallet_balance',
    {
      title: 'Sækja veski',
      description: 'Skilar nuverandi inneign auglýsanda í ISK.',
      inputSchema: {},
    },
    async () => {
      const r = await apiCall<{ wallet: { balanceIsk: number } }>('/v1/advertisers/me/wallet', {
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.wallet) }] };
    },
  );
}
