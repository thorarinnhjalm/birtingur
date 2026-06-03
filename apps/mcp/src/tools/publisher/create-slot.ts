import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  name: z.string(),
  sizes: z.array(z.object({ width: z.number(), height: z.number() })).min(1),
  pricing: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('cpm'), cpmIsk: z.number().int().positive() }),
    z.object({
      mode: z.literal('slot'),
      slotPriceIsk: z.number().int().positive(),
      slotPeriodDays: z.number().int().positive(),
    }),
  ]),
  placement: z.object({
    pageMatcher: z.string(),
    position: z.enum(['above_fold', 'in_content', 'sidebar']),
  }),
});

export function registerCreateSlot(server: McpServer, apiKey: string) {
  server.registerTool(
    'create_slot',
    {
      title: 'Búa til auglýsingapláss',
      description:
        'Býr til nýtt auglýsingapláss með nafni, stærðum, verðlagningu (CPM eða tímabil) og staðsetningu á síðunni. Eftir gerð, kalla á get_snippet_code til að fá HTML kóða til að líma inn.',
      inputSchema: Input.shape,
    },
    async (input) => {
      const r = await apiCall<{ slot: unknown }>('/v1/publishers/me/slots', {
        method: 'POST',
        body: input,
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.slot) }] };
    },
  );
}
