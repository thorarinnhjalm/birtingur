import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

export function registerListCategories(server: McpServer, apiKey: string) {
  server.registerTool(
    'list_categories',
    {
      title: 'List ad categories and inventory',
      description:
        'Lists every content category available for campaign targeting, with a per-category daily-impression inventory forecast. Call this before create_campaign to pick categories that actually have enough inventory for the intended budget.',
      inputSchema: {},
    },
    async () => {
      const r = await apiCall<unknown>('/v1/categories/inventory', { apiKey });
      return { content: [{ type: 'text' as const, text: JSON.stringify(r) }] };
    },
  );
}
