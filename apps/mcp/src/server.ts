import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPublisherTools } from './tools/publisher/index.js';

export async function createMcpServer(apiKey: string): Promise<McpServer> {
  const server = new McpServer({
    name: 'ada-ad-platform',
    version: '1.0.0',
  });

  // MCP is the publisher integration channel: project owners create ad slots and
  // embed them on their site. Advertiser/buying tools are intentionally not exposed.
  registerPublisherTools(server, apiKey);

  return server;
}
