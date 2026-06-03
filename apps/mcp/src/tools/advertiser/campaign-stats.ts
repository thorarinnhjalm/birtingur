import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ campaignId: z.string() });

export function registerCampaignStats(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_campaign_stats',
    {
      title: 'Sækja frammistöðu herferðar',
      description: 'Skilar birtingum, smellum, CTR og eyðslu per útgefanda fyrir tiltekna herferð.',
      inputSchema: Input.shape,
    },
    async ({ campaignId }) => {
      const r = await apiCall<{ stats: unknown }>(`/v1/campaigns/${campaignId}/stats`, { apiKey });
      return { content: [{ type: 'text', text: JSON.stringify(r.stats) }] };
    },
  );
}
