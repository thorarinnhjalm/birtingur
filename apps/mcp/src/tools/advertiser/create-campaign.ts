import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  creativeIds: z.array(z.string()).min(1),
  slotIds: z.array(z.string()).min(1),
  schedule: z.object({
    startsAt: z.string().describe('ISO 8601 timestamp'),
    endsAt: z.string().describe('ISO 8601 timestamp'),
  }),
  budget: z.object({
    mode: z.enum(['cpm_capped', 'slot_purchased']),
    totalIsk: z.number().int().positive(),
  }),
});

export function registerCreateCampaign(server: McpServer, apiKey: string) {
  server.registerTool(
    'create_campaign',
    {
      title: 'Búa til herferð',
      description:
        'Stofnar nýja auglýsingaherferð. Auglýsingar þurfa að vera samþykktar áður en herferð getur orðið virk. Krefst nægrar inneignar í veski.',
      inputSchema: Input.shape,
    },
    async (input) => {
      const r = await apiCall<{ campaign: unknown }>('/v1/campaigns', {
        method: 'POST',
        body: input,
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.campaign) }] };
    },
  );
}
