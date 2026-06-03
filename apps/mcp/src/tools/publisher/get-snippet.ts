import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ slotId: z.string() });

export function registerGetSnippet(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_snippet_code',
    {
      title: 'Sækja HTML kóða plásss',
      description:
        'Skilar HTML/JS kóða sem útgefandi/agent límir inn á vefsíðu þar sem auglýsingin á að birtast.',
      inputSchema: Input.shape,
    },
    async ({ slotId }) => {
      const r = await apiCall<{ html: string }>(`/v1/publishers/me/slots/${slotId}/snippet`, {
        apiKey,
      });
      return { content: [{ type: 'text', text: r.html }] };
    },
  );
}
