import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRegister } from './register.js';
import { registerListSlots } from './list-slots.js';
import { registerCreateSlot } from './create-slot.js';
import { registerUpdateSlot } from './update-slot.js';
import { registerGetSnippet } from './get-snippet.js';
import { registerGetReactComponent } from './get-react-component.js';
import { registerGetStats } from './get-stats.js';
import { registerSetContentPolicy } from './set-content-policy.js';
import { registerPendingApprovals } from './pending-approvals.js';
import { registerApproveCreative } from './approve-creative.js';
import { registerRejectCreative } from './reject-creative.js';

export function registerPublisherTools(server: McpServer, apiKey: string) {
  registerRegister(server, apiKey);
  registerListSlots(server, apiKey);
  registerCreateSlot(server, apiKey);
  registerUpdateSlot(server, apiKey);
  registerGetSnippet(server, apiKey);
  registerGetReactComponent(server);
  registerGetStats(server, apiKey);
  registerSetContentPolicy(server, apiKey);
  registerPendingApprovals(server, apiKey);
  registerApproveCreative(server, apiKey);
  registerRejectCreative(server, apiKey);
}
