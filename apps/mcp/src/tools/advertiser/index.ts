import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListCategories } from './list-categories.js';
import { registerGetWallet } from './get-wallet.js';
import { registerListCreatives } from './list-creatives.js';
import { registerCreateCampaign } from './create-campaign.js';
import { registerGetCampaign } from './get-campaign.js';
import { registerListCampaigns } from './list-campaigns.js';

export function registerAdvertiserTools(server: McpServer, apiKey: string) {
  registerListCategories(server, apiKey);
  registerGetWallet(server, apiKey);
  registerListCreatives(server, apiKey);
  registerCreateCampaign(server, apiKey);
  registerGetCampaign(server, apiKey);
  registerListCampaigns(server, apiKey);
}
