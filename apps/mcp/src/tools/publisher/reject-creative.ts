import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ campaignId: z.string(), reason: z.string().optional() });

export function registerRejectCreative(server: McpServer, apiKey: string) {
  server.registerTool(
    'reject_creative',
    {
      title: 'Hafna auglýsingu',
      description: 'Hafnar herferð á útgefendavef með valfrjálsri ástæðu sem auglýsandi sér.',
      inputSchema: Input.shape,
    },
    async (input) => {
      const r = await apiCall<{ campaign: unknown }>(
        `/v1/publishers/me/approvals/${input.campaignId}`,
        { method: 'POST', body: { action: 'reject', reason: input.reason }, apiKey },
      );
      return { content: [{ type: 'text', text: JSON.stringify(r.campaign) }] };
    },
  );
}
