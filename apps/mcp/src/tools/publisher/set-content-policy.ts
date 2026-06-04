import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  blockedCategories: z.array(z.string()),
  requireManualApproval: z.boolean(),
});

export function registerSetContentPolicy(server: McpServer, apiKey: string) {
  server.registerTool(
    'set_content_policy',
    {
      title: 'Stilla efnisstefnu',
      description:
        'Setur lista af bönnuðum flokkum og hvort útgefandi vilji samþykkja allar auglýsingar handvirkt.',
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
