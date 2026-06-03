import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

export function registerListCampaigns(server: McpServer, apiKey: string) {
  server.registerTool(
    'list_my_campaigns',
    {
      title: 'Listi yfir mínar herferðir',
      description: 'Sýnir allar herferðir auglýsandans (drög, í yfirferð, virkar, kláraðar).',
      inputSchema: {},
    },
    async () => {
      const r = await apiCall<{ campaigns: unknown[] }>('/v1/campaigns', { apiKey });
      return { content: [{ type: 'text', text: JSON.stringify(r.campaigns) }] };
    },
  );
}
