import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  categories: z
    .array(z.string())
    .optional()
    .describe(
      'The categories you intend to target. Supply them to get a deduplicated combined inventory figure, which is the only correct way to size a multi-category budget.',
    ),
});

export function registerListCategories(server: McpServer, apiKey: string) {
  server.registerTool(
    'list_categories',
    {
      title: 'List ad categories and inventory',
      description:
        'Lists every content category available for campaign targeting, with a per-category daily-impression inventory forecast. Call this before create_campaign to pick categories that actually have enough inventory for the intended budget. ' +
        'IMPORTANT: these per-category figures are NOT additive. A publisher declaring several categories has its whole daily volume reported under each one, so adding the figures for a multi-category selection counts that publisher more than once and overstates what can be delivered. ' +
        'Pass the categories you intend to target and this tool returns a deduplicated `combined` figure alongside the per-category list — size the budget from `combined.availableDailyImpressions`, never from a sum.',
      inputSchema: Input.shape,
    },
    async ({ categories }) => {
      const perCategory = await apiCall<unknown>('/v1/categories/inventory', { apiKey });
      if (!categories || categories.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ perCategory }) }] };
      }
      // A single unknown slug 400s the combined endpoint. Losing the whole tool
      // call for that would also lose `perCategory`, which is exactly the list
      // an agent needs to discover the valid slugs and retry — so the failure
      // is reported alongside the data rather than instead of it.
      try {
        const combined = await apiCall<unknown>(
          `/v1/categories/inventory/combined?categories=${encodeURIComponent(categories.join(','))}`,
          { apiKey },
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ perCategory, combined }) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                perCategory,
                combined: null,
                combinedError:
                  err instanceof Error ? err.message : 'combined inventory lookup failed',
              }),
            },
          ],
        };
      }
    },
  );
}
