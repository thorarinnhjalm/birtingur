import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';
import { withPlacementWarning } from './placement-warning.js';

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
      .describe(
        'Nýjar leyfðar stærðir fyrir plássið. Aðeins IAB-staðlaðar stærðir — sjá list_ad_sizes.',
      ),
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
        'Breytir nafni, stærðum, staðsetningu eða stöðu plássins. Verðlagning er ekki stillanleg — vettvangurinn notar fast CPM á öll pláss.',
      inputSchema: Input.shape,
    },
    async ({ slotId, patch }) => {
      const r = await apiCall<unknown>(`/v1/publishers/me/slots/${slotId}`, {
        method: 'PATCH',
        body: patch,
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
