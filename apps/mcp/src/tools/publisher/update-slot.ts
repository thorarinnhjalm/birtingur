import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  slotId: z.string().describe('ID þess pláss sem á að uppfæra'),
  patch: z.object({
    name: z.string().optional().describe('Nýtt heiti á plássinu'),
    sizes: z
      .array(
        z.object({
          width: z.number().int().positive().describe('Breidd í dílum'),
          height: z.number().int().positive().describe('Hæð í dílum'),
        }),
      )
      .optional()
      .describe('Nýjar leyfðar stærðir fyrir plássið'),
    pricing: z
      .union([
        z.object({
          mode: z.literal('cpm'),
          cpmIsk: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Fast CPM verð í krónum. Sjálfgefið 550 kr.'),
        }),
        z.object({
          mode: z.literal('slot'),
          slotPriceIsk: z.number().int().positive().describe('Fast verð í krónum'),
          slotPeriodDays: z.number().int().positive().describe('Dagar í tímabili'),
        }),
      ])
      .optional()
      .describe('Nýtt greiðslu- og verðlagningarform'),
    placement: z
      .object({
        pageMatcher: z.string().describe('Slóðaregla, t.d. "/uppskriftir/*" eða "*"'),
        position: z
          .enum(['above_fold', 'in_content', 'sidebar'])
          .describe('Ný staðsetning plássins'),
      })
      .optional()
      .describe('Nýjar staðsetningarstillingar'),
    status: z
      .enum(['active', 'paused'])
      .optional()
      .describe('Ný staða plássins (active eða paused)'),
  }),
});

export function registerUpdateSlot(server: McpServer, apiKey: string) {
  server.registerTool(
    'update_slot',
    {
      title: 'Uppfæra pláss',
      description:
        'Breytir nafni, stærðum, verði, staðsetningu eða stöðu plássins. Athugið að ef pricing er uppfært í cpm en cpmIsk vantar, verður það sjálfkrafa sett á 550.',
      inputSchema: Input.shape,
    },
    async ({ slotId, patch }) => {
      const requestPatch = { ...patch };
      if (
        requestPatch.pricing &&
        typeof requestPatch.pricing === 'object' &&
        'mode' in requestPatch.pricing &&
        requestPatch.pricing.mode === 'cpm' &&
        !('cpmIsk' in requestPatch.pricing)
      ) {
        requestPatch.pricing = {
          ...requestPatch.pricing,
          cpmIsk: 550,
        };
      }
      const r = await apiCall<unknown>(`/v1/publishers/me/slots/${slotId}`, {
        method: 'PATCH',
        body: requestPatch,
        apiKey,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(r) }] };
    },
  );
}
