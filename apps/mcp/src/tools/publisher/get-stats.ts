import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ period: z.enum(['7d', '30d']).default('30d') });

export function registerGetStats(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_stats',
    {
      title: 'Sækja tölfræði',
      description: 'Sækir samanteknar birtingar, smelli og tekjur útgefanda fyrir valið tímabil.',
      inputSchema: Input.shape,
    },
    async ({ period }) => {
      const r = await apiCall<unknown>(`/v1/publishers/me/stats?period=${period}`, {
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );
}
