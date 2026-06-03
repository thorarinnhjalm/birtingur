import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';
import { URLSearchParams } from 'url';

const Input = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  maxCpm: z.number().optional(),
});

export function registerSearchSlots(server: McpServer, apiKey: string) {
  server.registerTool(
    'search_slots',
    {
      title: 'Finna auglýsingapláss',
      description: 'Leitar að tiltækum auglýsingaplássum eftir stærð og hámarksverði (CPM).',
      inputSchema: Input.shape,
    },
    async (input) => {
      const qs = new URLSearchParams();
      if (input.width) qs.set('width', String(input.width));
      if (input.height) qs.set('height', String(input.height));
      if (input.maxCpm) qs.set('maxCpm', String(input.maxCpm));
      const r = await apiCall<{ slots: unknown[] }>(`/v1/slots/search?${qs.toString()}`, {
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.slots) }] };
    },
  );
}
