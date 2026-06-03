import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ campaignId: z.string() });

export function registerApproveCreative(server: McpServer, apiKey: string) {
  server.registerTool(
    'approve_creative',
    {
      title: 'Samþykkja auglýsingu',
      description:
        'Samþykkir herferð á útgefendavef. Auglýsingin byrjar að birtast eftir nokkrar sekúndur.',
      inputSchema: Input.shape,
    },
    async ({ campaignId }) => {
      const r = await apiCall<{ campaign: unknown }>(`/v1/publishers/me/approvals/${campaignId}`, {
        method: 'POST',
        body: { action: 'approve' },
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.campaign) }] };
    },
  );
}
