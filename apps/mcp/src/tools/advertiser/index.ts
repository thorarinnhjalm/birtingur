import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRegister } from './register.js';
import { registerWalletBalance } from './wallet-balance.js';
import { registerTopupLink } from './topup-link.js';
import { registerUploadCreative } from './upload-creative.js';
import { registerSearchSlots } from './search-slots.js';
import { registerCreateCampaign } from './create-campaign.js';
import { registerPauseCampaign } from './pause-campaign.js';
import { registerCampaignStats } from './campaign-stats.js';
import { registerListCampaigns } from './list-campaigns.js';

export function registerAdvertiserTools(server: McpServer, apiKey: string) {
  registerRegister(server, apiKey);
  registerWalletBalance(server, apiKey);
  registerTopupLink(server, apiKey);
  registerUploadCreative(server, apiKey);
  registerSearchSlots(server, apiKey);
  registerCreateCampaign(server, apiKey);
  registerPauseCampaign(server, apiKey);
  registerCampaignStats(server, apiKey);
  registerListCampaigns(server, apiKey);
}
