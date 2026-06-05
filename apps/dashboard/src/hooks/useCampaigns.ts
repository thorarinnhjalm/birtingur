import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Campaign, Creative } from '@ada/shared';

export interface CampaignStatsPoint {
  date: string; // YYYY-MM-DD or YYYY-MM-DDTHH
  impressions: number;
  clicks: number;
}

export function useCampaigns(enabled = true) {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiFetch<Campaign[]>('/v1/campaigns'),
    enabled,
    retry: false,
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => apiFetch<Campaign>(`/v1/campaigns/${id}`),
    enabled: !!id,
  });
}

export function useCampaignStats(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', id, 'stats'],
    queryFn: () => apiFetch<CampaignStatsPoint[]>(`/v1/campaigns/${id}/stats`),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      creativeIds: string[];
      categories: string[];
      schedule: {
        startsAt: string;
        endsAt: string;
      };
      budget: {
        mode: 'cpm_capped' | 'slot_purchased';
        totalIsk: number;
      };
    }) =>
      apiFetch<Campaign>('/v1/campaigns', {
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
    queryFn: () => apiFetch<Creative>(`/v1/creatives/${id}`),
    enabled: !!id,
  });
}

export interface CreativeStatsResponse {
  impressions: number;
  clicks: number;
  ctr: number;
  hours: Array<{ hour: string; impressions: number; clicks: number }>;
}

export function useCreativeStats(id: string | undefined) {
  return useQuery({
    queryKey: ['creatives', id, 'stats'],
    queryFn: () => apiFetch<CreativeStatsResponse>(`/v1/creatives/${id}/stats`),
    enabled: !!id,
  });
}

