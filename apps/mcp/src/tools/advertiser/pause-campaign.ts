import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ campaignId: z.string() });

export function registerPauseCampaign(server: McpServer, apiKey: string) {
  server.registerTool(
    'pause_campaign',
    {
      title: 'Þagga herferð',
      description: 'Stöðvar herferð tímabundið. Hægt að kveikja aftur með update.',
      inputSchema: Input.shape,
    },
    async ({ campaignId }) => {
      const r = await apiCall<{ campaign: unknown }>(`/v1/campaigns/${campaignId}`, {
        method: 'PATCH',
        body: { status: 'paused' },
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.campaign) }] };
    },
  );
}
