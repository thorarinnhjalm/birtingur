import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface SlotStats {
  impressions: number;
  clicks: number;
  spendIsk: number;
  pageviews: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
    pageviews: number;
  }[];
  byCampaign?: Record<
    string,
    {
      campaignName: string;
      advertiserName: string;
      impressions: number;
      clicks: number;
      earningsIsk: number;
    }
  >;
}

export function useSlotStats(slotId: string | undefined) {
  return useQuery<SlotStats>({
    queryKey: ['publisher', 'slot-stats', slotId],
    queryFn: () => apiFetch<SlotStats>(`/v1/publishers/me/slots/${slotId}/stats?timeframe=30`),
    enabled: !!slotId,
  });
}
