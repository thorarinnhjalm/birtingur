import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  slotId: z.string(),
  patch: z.object({
    name: z.string().optional(),
    sizes: z.array(z.object({ width: z.number(), height: z.number() })).optional(),
    pricing: z.unknown().optional(),
    placement: z.unknown().optional(),
    status: z.enum(['active', 'paused']).optional(),
  }),
});

export function registerUpdateSlot(server: McpServer, apiKey: string) {
  server.registerTool(
    'update_slot',
    {
      title: 'Uppfæra pláss',
      description: 'Breytir nafni, stærðum, verði, staðsetningu eða stöðu plásss.',
      inputSchema: Input.shape,
    },
    async ({ slotId, patch }) => {
      const r = await apiCall<unknown>(`/v1/publishers/me/slots/${slotId}`, {
        method: 'PATCH',
        body: patch,
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );
}
