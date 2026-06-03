import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  imageUrl: z.string().url().describe('URL á tilbúna mynd (PNG/JPG, hámark 2 MB)'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  clickUrl: z.string().url().describe('HTTPS slóð sem smellur fer á'),
  ocrTextHint: z.string().optional().describe('Texti á auglýsingunni (hjálpar auto-scan).'),
});

export function registerUploadCreative(server: McpServer, apiKey: string) {
  server.registerTool(
    'upload_creative',
    {
      title: 'Hlaða inn auglýsingu',
      description:
        'Skráir nýtt auglýsingaefni og keyrir sjálfvirkan skanna. Skilar creative.id og reviewStatus (auto_approved / pending / rejected).',
      inputSchema: Input.shape,
    },
    async (input) => {
      const r = await apiCall<{ creative: unknown }>('/v1/creatives', {
        method: 'POST',
        body: input,
        apiKey,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r.creative) }] };
    },
  );
}
