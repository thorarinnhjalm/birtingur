import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ amountIsk: z.number().int().positive() });

export function registerTopupLink(server: McpServer, apiKey: string) {
  server.registerTool(
    'create_topup_link',
    {
      title: 'Búa til greiðsluhlekk fyrir inneign',
      description:
        'Skilar Teya checkout URL sem notandi opnar í vafra til að setja inneign á veski. Topup er sjálfvirkt staðfestur með webhook eftir greiðslu.',
      inputSchema: Input.shape,
    },
    async ({ amountIsk }) => {
      const r = await apiCall<{ checkoutUrl: string; sessionId: string }>(
        '/v1/advertisers/me/wallet/topup',
        { method: 'POST', body: { amountIsk }, apiKey },
      );
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );
}
