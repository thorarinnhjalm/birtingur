import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Campaign, Creative } from '@ada/shared';

export interface CampaignStatsPoint {
  date: string; // YYYY-MM-DD or YYYY-MM-DDTHH
  impressions: number;
  clicks: number;
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiFetch<{ campaigns: Campaign[] }>('/v1/campaigns').then((r) => r.campaigns),
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => apiFetch<{ campaign: Campaign }>(`/v1/campaigns/${id}`).then((r) => r.campaign),
    enabled: !!id,
  });
}

export function useCampaignStats(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', id, 'stats'],
    queryFn: () =>
      apiFetch<{ stats: CampaignStatsPoint[] }>(`/v1/campaigns/${id}/stats`).then((r) => r.stats),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      startDate: string;
      endDate: string;
      totalBudgetIsk: number;
      clickUrl: string;
      creativeUrl: string;
      slotIds: string[];
    }) =>
      apiFetch<{ campaign: Campaign }>('/v1/campaigns', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useCreative(id: string | undefined) {
  return useQuery({
    queryKey: ['creatives', id],
    queryFn: () => apiFetch<{ creative: Creative }>(`/v1/creatives/${id}`).then((r) => r.creative),
    enabled: !!id,
  });
}
