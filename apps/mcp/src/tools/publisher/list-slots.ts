import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

export function registerListSlots(server: McpServer, apiKey: string) {
  server.registerTool(
    'list_my_slots',
    {
      title: 'Sækja auglýsingapláss',
      description: 'Listar öll auglýsingapláss sem útgefandinn á.',
      inputSchema: {},
    },
    async () => {
      const r = await apiCall<{ slots: unknown[] }>('/v1/publishers/me/slots', { apiKey });
      return { content: [{ type: 'text', text: JSON.stringify(r.slots) }] };
    },
  );
}
