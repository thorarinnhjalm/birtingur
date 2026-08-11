import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRegister } from './register.js';
import { registerListSlots } from './list-slots.js';
import { registerCreateSlot } from './create-slot.js';
import { registerUpdateSlot } from './update-slot.js';
import { registerGetSnippet } from './get-snippet.js';
import { registerGetReactComponent } from './get-react-component.js';
import { registerGetStats } from './get-stats.js';
import { registerCheckDelivery } from './check-delivery.js';
import { registerSetContentPolicy } from './set-content-policy.js';
import { registerGetChangelog } from './get-changelog.js';

export function registerPublisherTools(server: McpServer, apiKey: string) {
  registerRegister(server, apiKey);
  registerListSlots(server, apiKey);
  registerCreateSlot(server, apiKey);
  registerUpdateSlot(server, apiKey);
  registerGetSnippet(server, apiKey);
  registerGetReactComponent(server, apiKey);
  registerGetStats(server, apiKey);
  registerCheckDelivery(server, apiKey);
  registerSetContentPolicy(server, apiKey);
  registerGetChangelog(server);
}
