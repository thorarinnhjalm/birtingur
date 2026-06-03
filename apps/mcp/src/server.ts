import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPublisherTools } from './tools/publisher/index.js';
import { registerAdvertiserTools } from './tools/advertiser/index.js';

export function createMcpServer(apiKey: string): McpServer {
  const server = new McpServer({
    name: 'ada-ad-platform',
    version: '1.0.0',
  });
  registerPublisherTools(server, apiKey);
  registerAdvertiserTools(server, apiKey);
  return server;
}
