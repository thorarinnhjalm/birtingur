import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  campaign_id: z.string().describe('Campaign id, e.g. "cmp_xxxxxxxxxxxxxxxxxxxxxxxx".'),
});

export function registerGetCampaign(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_campaign',
    {
      title: 'Get campaign status',
      description:
        'Fetches a single campaign by id, including its status (draft/pending_approval/active/paused/completed), why it might be pending, and its budget/spend — use this to report back on a campaign this agent bought.',
      inputSchema: Input.shape,
    },
    async ({ campaign_id }) => {
      const r = await apiCall<unknown>(`/v1/campaigns/${campaign_id}`, { apiKey });
      return { content: [{ type: 'text' as const, text: JSON.stringify(r) }] };
    },
  );
}
