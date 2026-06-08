import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  name: z
    .string()
    .describe('Sérsniðið heiti á auglýsingaplássi til auðkenningar, t.d. "Forsíða Billboard"'),
  sizes: z
    .array(
      z.object({
        width: z.number().int().positive().describe('Breidd í dílum (pixels)'),
        height: z.number().int().positive().describe('Hæð í dílum (pixels)'),
      }),
    )
    .min(1)
    .describe(
      'Listi yfir leyfðar stærðir. Styður IAB staðla: 728x90, 300x250, 300x600, 320x100, 980x120',
    ),
  pricing: z
    .discriminatedUnion('mode', [
      z.object({
        mode: z.literal('cpm'),
        cpmIsk: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Verð fyrir hverjar 1.000 birtingar (CPM). Sjálfgefið 550 ISK.'),
      }),
      z.object({
        mode: z.literal('slot'),
        slotPriceIsk: z
          .number()
          .int()
          .positive()
          .describe('Fast verð fyrir tímabil í krónum, t.d. 25000'),
        slotPeriodDays: z.number().int().positive().describe('Lengd tímabils í dögum, t.d. 30'),
      }),
    ])
    .describe(
      'Greiðslutilhögun plássins: annaðhvort CPM (per 1.000 flettingar) eða Slot fastaverð per tímabil',
    ),
  placement: z
    .object({
      pageMatcher: z
        .string()
        .describe(
          'Regla til að para við slóðir þar sem á að sýna auglýsinguna. Notaðu "*" fyrir allar síður.',
        ),
      position: z
        .enum(['above_fold', 'in_content', 'sidebar'])
        .describe('Staðsetning plássins á síðunni'),
    })
    .describe('Staðsetningarstillingar fyrir auglýsinguna á vefnum'),
});

export function registerCreateSlot(server: McpServer, apiKey: string) {
  server.registerTool(
    'create_slot',
    {
      title: 'Búa til auglýsingapláss',
      description:
        'Býr til nýtt auglýsingapláss með nafni, stærðum, verðlagningu (CPM eða tímabil) og staðsetningu á síðunni. Eftir gerð, kalla á get_snippet_code til að fá HTML kóða eða get_react_component fyrir Next.js/React kóða. Styður einungis eftirfarandi staðlaðar stærðir: 728x90, 300x250, 300x600, 320x100 og 980x120.',
      inputSchema: Input.shape,
    },
    async (input) => {
      const requestBody = { ...input };
      if (requestBody.pricing.mode === 'cpm' && !requestBody.pricing.cpmIsk) {
        requestBody.pricing = {
          ...requestBody.pricing,
          cpmIsk: 550,
        };
      }
      const r = await apiCall<unknown>('/v1/publishers/me/slots', {
        method: 'POST',
        body: requestBody,
        apiKey,
      });
      let warning: string | undefined;
      const slotObj = r as any;
      if (slotObj && slotObj.name && slotObj.placement?.position) {
        const lowerName = slotObj.name.toLowerCase();
        const pos = slotObj.placement.position;
        if (
          pos === 'sidebar' &&
          (lowerName.includes('haus') ||
            lowerName.includes('header') ||
            lowerName.includes('topp') ||
            lowerName.includes('billboard'))
        ) {
          warning = `Viðvörun: Plássið heitir "${slotObj.name}" (bendir til efsta hluta síðu/header) en líkamleg staðsetning (placement.position) er skilgreind sem "sidebar".`;
        } else if (
          (pos === 'above_fold' || pos === 'in_content') &&
          (lowerName.includes('hlið') || lowerName.includes('sidebar'))
        ) {
          warning = `Viðvörun: Plássið heitir "${slotObj.name}" (bendir til hliðardálks) en líkamleg staðsetning (placement.position) er skilgreind sem "${pos}".`;
        }
      }
      const responseObj = warning ? { ...slotObj, warning } : r;
      return { content: [{ type: 'text' as const, text: JSON.stringify(responseObj, null, 2) }] };
    },
  );
}
