import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  companyName: z.string(),
  kennitala: z.string().regex(/^\d{10}$/),
  vatNumber: z.string(),
});

export function registerRegister(server: McpServer, apiKey: string) {
  server.registerTool(
    'register_advertiser',
    {
      title: 'Skrá auglýsanda',
      description: 'Skráir nýjan auglýsanda á vettvanginn.',
      inputSchema: Input.shape,
    },
    async (input) => {
      const r = await apiCall<{ advertiser: unknown }>('/v1/advertisers', {
        method: 'POST',
        body: input,
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.advertiser) }] };
    },
  );
}
