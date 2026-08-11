import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { IAB_STANDARD_SIZES, FLAT_CPM_ISK } from '@ada/shared';

/**
 * The supported ad sizes, straight from `@ada/shared`.
 *
 * Integrators were hardcoding the five sizes on their side because the only
 * place they appeared was prose inside a tool description — so a change here
 * would silently drift out of sync with every embed built against it. This
 * makes the list fetchable, and `createSlot` now rejects anything outside it,
 * so the two can't disagree.
 */
export function registerListAdSizes(server: McpServer) {
  server.registerTool(
    'list_ad_sizes',
    {
      title: 'Sækja studdar auglýsingastærðir',
      description:
        'Skilar öllum auglýsingastærðum sem Birtingur styður (IAB-staðlaðar) ásamt heiti og notkunarábendingu. Sæktu þennan lista í stað þess að harðkóða stærðir — create_slot hafnar öllum stærðum utan hans.',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              sizes: IAB_STANDARD_SIZES.map((s) => ({
                width: s.width,
                height: s.height,
                key: `${s.width}x${s.height}`,
                name: s.name,
              })),
              cpmIsk: FLAT_CPM_ISK,
              note: `Verðlagning er föst á vettvangnum: ${FLAT_CPM_ISK} kr. CPM (per 1.000 birtingar) fyrir öll pláss. Ekki er hægt að setja eigið verð.`,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}
