import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

interface CreativeLike {
  reviewStatus: string;
  [key: string]: unknown;
}

export function registerListCreatives(server: McpServer, apiKey: string) {
  server.registerTool(
    'list_creatives',
    {
      title: 'List approved creatives',
      description:
        "Lists the advertiser's approved ad creatives (auto- or manually-approved only — pending and rejected creatives are omitted, since they can't be attached to a new campaign). Agents buy campaigns using existing creatives in this version; creative generation/upload is a separate capability not yet exposed over MCP.",
      inputSchema: {},
    },
    async () => {
      const all = await apiCall<CreativeLike[]>('/v1/creatives', { apiKey });
      const approved = all.filter(
        (c) => c.reviewStatus === 'auto_approved' || c.reviewStatus === 'manual_approved',
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(approved) }] };
    },
  );
}
