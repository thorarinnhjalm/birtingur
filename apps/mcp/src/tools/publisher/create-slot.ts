import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';
import { withPlacementWarning } from './placement-warning.js';

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
      'Listi yfir leyfðar stærðir. Aðeins IAB-staðlaðar stærðir eru leyfðar — sæktu þær með list_ad_sizes í stað þess að harðkóða þær.',
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
        'Býr til nýtt auglýsingapláss með nafni, stærðum og staðsetningu á síðunni. Plássið tilheyrir útgefandanum sem lykillinn á — kallaðu á whoami fyrst ef þú þarft publisherId. Verðlagning er ekki stillanleg: vettvangurinn notar fast CPM á öll pláss. Eftir gerð, kalla á get_snippet_code til að fá HTML kóða eða get_react_component fyrir Next.js/React kóða.',
      inputSchema: Input.shape,
    },
    async (input) => {
      // No pricing is sent: createSlot locks every slot to FLAT_CPM_ISK and
      // accrual only ever computes that rate, so any price passed here was
      // overwritten server-side without telling the caller.
      const r = await apiCall<unknown>('/v1/publishers/me/slots', {
        method: 'POST',
        body: input,
        apiKey,
      });
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(withPlacementWarning(r), null, 2) },
        ],
      };
    },
  );
}
