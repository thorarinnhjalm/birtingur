import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWhoami } from './whoami.js';
import { registerListAdSizes } from './list-ad-sizes.js';

/** Tools registered for every scope — orientation, not capability. */
export function registerCommonTools(server: McpServer, apiKey: string) {
  registerWhoami(server, apiKey);
  registerListAdSizes(server);
}
