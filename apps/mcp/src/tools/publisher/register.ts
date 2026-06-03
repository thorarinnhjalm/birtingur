import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  domain: z.string().describe('Lén vefsins, t.d. "kjarninn.is"'),
  displayName: z.string().describe('Sýnilegt nafn útgefanda'),
  payoutMethod: z.object({
    type: z.literal('bank'),
    iban: z.string(),
    kennitala: z.string().regex(/^\d{10}$/),
    accountName: z.string(),
  }),
});

export function registerRegister(server: McpServer, apiKey: string) {
  server.registerTool(
    'register_publisher',
    {
      title: 'Skrá útgefanda',
      description:
        'Skráir nýjan útgefanda á vettvanginn. Notandi þarf að vera þegar innskráður (kallandi á API hefur bearer token sem auðkennir þá). Skilar útgefendaupplýsingum með id sem hægt er að nota í síðari aðgerðum.',
      inputSchema: Input.shape as any,
    },
    async (input: any) => {
      const r = await apiCall<{ publisher: unknown }>('/v1/publishers', {
        method: 'POST',
        body: input,
        apiKey,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(r.publisher) }] };
    },
  );
}
