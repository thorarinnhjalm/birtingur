import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  slotId: z.string().describe('ID plássins sem á að greina, t.d. "slot_abc123"'),
});

/**
 * The "is it working?" tool.
 *
 * An integrator who embeds a slot and sees the Birtingur house ad cannot
 * tell a broken integration from an empty market — both render the same
 * thing. Every other publisher tool reports what was configured; this one
 * reports what is actually happening, and names the blocker.
 */
export function registerCheckDelivery(server: McpServer, apiKey: string) {
  server.registerTool(
    'check_slot_delivery',
    {
      title: 'Athuga birtingu á plássi',
      description:
        'Segir hvort plássið sé raunverulega að birta auglýsingar frá auglýsendum, og ef ekki, hver ástæðan er (engin herferð í flokknum, stærð passar ekki, pláss í pásu, efnisstefna útilokar, o.s.frv.) ásamt næstu skrefum. Notaðu þetta þegar þú sérð húsauglýsingu Birtings í plássinu og vilt vita hvort það sé bilun eða eðlilegt ástand. Breytir engu, les aðeins.',
      inputSchema: Input.shape,
    },
    async ({ slotId }) => {
      const r = await apiCall<unknown>(`/v1/publishers/me/slots/${slotId}/delivery`, { apiKey });
      return { content: [{ type: 'text' as const, text: JSON.stringify(r, null, 2) }] };
    },
  );
}
