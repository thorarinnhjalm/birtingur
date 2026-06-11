import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SENSITIVE_AD_CATEGORY_SLUGS } from '@ada/shared';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  blockedCategories: z.array(z.enum(SENSITIVE_AD_CATEGORY_SLUGS as [string, ...string[]])),
  requireManualApproval: z.boolean(),
});

export function registerSetContentPolicy(server: McpServer, apiKey: string) {
  server.registerTool(
    'set_content_policy',
    {
      title: 'Stilla efnisstefnu',
      description:
        'Setur lista af bönnuðum auglýsingaflokkum og hvort útgefandi vilji samþykkja allar auglýsingar handvirkt. ' +
        `Gildir flokkar: ${SENSITIVE_AD_CATEGORY_SLUGS.join(', ')}.`,
      inputSchema: Input.shape,
    },
    async (input) => {
      const r = await apiCall<unknown>('/v1/publishers/me', {
        method: 'PATCH',
        body: { contentPolicy: input },
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );
}
