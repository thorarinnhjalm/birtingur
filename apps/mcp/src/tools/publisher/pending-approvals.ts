import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

export function registerPendingApprovals(server: McpServer, apiKey: string) {
  server.registerTool(
    'list_pending_approvals',
    {
      title: 'Listi yfir auglýsingar sem bíða samþykktar',
      description: 'Sýnir auglýsingar sem útgefandi þarf að samþykkja eða hafna á sínum plássum.',
      inputSchema: {},
    },
    async () => {
      const r = await apiCall<{ items: unknown[] }>('/v1/publishers/me/pending-approvals', {
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.items) }] };
    },
  );
}
