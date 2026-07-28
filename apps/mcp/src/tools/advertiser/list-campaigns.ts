import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

export function registerListCampaigns(server: McpServer, apiKey: string) {
  server.registerTool(
    'list_campaigns',
    {
      title: 'List campaigns',
      description:
        "Lists all of the advertiser's campaigns with status and spend, so an agent can report back on what it has bought and how each campaign is doing.",
      inputSchema: {},
    },
    async () => {
      const r = await apiCall<unknown[]>('/v1/campaigns', { apiKey });
      return { content: [{ type: 'text' as const, text: JSON.stringify(r) }] };
    },
  );
}
