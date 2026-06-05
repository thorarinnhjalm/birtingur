import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AD_CATEGORY_SLUGS } from '@ada/shared';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  domain: z.string().describe('Lén vefsins, t.d. "kjarninn.is"'),
  displayName: z.string().describe('Sýnilegt nafn útgefanda'),
  categories: z
    .array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]]))
    .min(1)
    .describe('Flokkar efnis á vefnum, t.d. ["taekni"]'),
  payoutMethod: z
    .object({
      type: z.literal('bank').describe('Tegund útborgunar (alltaf bank í V1)'),
      iban: z
        .string()
        .describe(
          '12-stafa íslenskt bankareikningsnúmer (t.d. "012315012345") eða alþjóðlegt IBAN númer. Bandstrik og bil eru sjálfkrafa hreinsuð.',
        ),
      kennitala: z
        .string()
        .regex(/^\d{10}$/)
        .describe('10-stafa kennitala tengd bankareikningi án bandstriks (t.d. "1234567890")'),
      accountName: z.string().describe('Nafn reikningshafa eins og það birtist í bankanum'),
    })
    .describe('Upplýsingar um bankareikning fyrir útborganir'),
});

export function registerRegister(server: McpServer, apiKey: string) {
  server.registerTool(
    'register_publisher',
    {
      title: 'Skrá útgefanda',
      description:
        'Skráir nýjan útgefanda á vettvanginn. Notandi þarf að vera þegar innskráður (kallandi á API hefur bearer token sem auðkennir þá). Skilar útgefendaupplýsingum með id sem hægt er að nota í síðari aðgerðum.',
      inputSchema: Input.shape,
    },
    async (input) => {
      const r = await apiCall<unknown>('/v1/publishers', {
        method: 'POST',
        body: input,
        apiKey,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(r) }] };
    },
  );
}
