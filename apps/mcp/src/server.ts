import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPublisherTools } from './tools/publisher/index.js';
import { registerAdvertiserTools } from './tools/advertiser/index.js';
import { apiCall } from './lib/api-client.js';

export async function createMcpServer(apiKey: string): Promise<McpServer> {
  const server = new McpServer({
    name: 'ada-ad-platform',
    version: '1.0.0',
  });

  // Sjálfgefið skráum við bæði ef ekki næst samband við bakenda
  let scope: 'advertiser' | 'publisher' | 'both' = 'both';
  try {
    const keyInfo = await apiCall<{ scope: 'advertiser' | 'publisher' | 'both' }>(
      '/v1/api-keys/me',
      {
        apiKey,
      },
    );
    scope = keyInfo.scope;
  } catch (err) {
    console.error('Failed to retrieve API key scope for MCP connection:', err);
  }

  if (scope === 'publisher' || scope === 'both') {
    registerPublisherTools(server, apiKey);
  }
  if (scope === 'advertiser' || scope === 'both') {
    registerAdvertiserTools(server, apiKey);
  }

  return server;
}
