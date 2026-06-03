import { AdplatformStats } from './components/stats.js';
import { AdplatformApprovalQueue } from './components/approval-queue.js';
import { AdplatformCampaignStats } from './components/campaign-stats.js';

if (typeof window !== 'undefined') {
  if (!customElements.get('adplatform-stats')) {
    customElements.define('adplatform-stats', AdplatformStats);
  }
  if (!customElements.get('adplatform-approval-queue')) {
    customElements.define('adplatform-approval-queue', AdplatformApprovalQueue);
  }
  if (!customElements.get('adplatform-campaign-stats')) {
    customElements.define('adplatform-campaign-stats', AdplatformCampaignStats);
  }
}
