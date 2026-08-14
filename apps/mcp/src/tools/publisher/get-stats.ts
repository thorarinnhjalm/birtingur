import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({ period: z.enum(['7d', '30d']).default('30d') });

/**
 * The stats path for a period.
 *
 * The parameter is `timeframe` and its values are `7` and `30` — that is what
 * `GET /v1/publishers/me/stats` parses (`routes/publishers.ts`). This tool sent
 * `?period=30d`, which the route ignored, so it silently fell through to its
 * 7-day default: `period: '7d'` and `period: '30d'` returned identical numbers
 * while the tool description promised "fyrir valið tímabil". An agent asked for
 * a month got a week, with nothing to indicate it.
 *
 * Exported so the mapping is testable without standing up an HTTP server; the
 * exact query string IS the contract with the route.
 */
export function statsPath(period: '7d' | '30d'): string {
  return `/v1/publishers/me/stats?timeframe=${period === '30d' ? 30 : 7}`;
}

export function registerGetStats(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_stats',
    {
      title: 'Sækja tölfræði',
      description:
        'Sækir samanteknar birtingar, smelli og tekjur útgefanda fyrir valið tímabil (7 eða 30 daga, sjálfgefið 30). Tekjutalan `netEarningsIsk` er nettóvirði umferðarinnar á tímabilinu (brúttó `spendIsk` að frádreginni þóknun); raunveruleg útborgun fer eftir stöðu í höfuðbók og birtist á greiðslusíðunni.',
      inputSchema: Input.shape,
    },
    async ({ period }) => {
      const r = await apiCall<unknown>(statsPath(period), { apiKey });
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );
}
