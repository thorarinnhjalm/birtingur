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

export interface CampaignStatsResponse {
  impressions: number;
  clicks: number;
  spendIsk?: number;
  hours: Array<{ hour: string; impressions: number; clicks: number }>;
  byPublisher?: Record<
    string,
    {
      impressions: number;
      clicks: number;
      spendIsk: number;
      displayName: string;
      domain: string;
      byCreative?: Record<
        string,
        { impressions: number; clicks: number; label: string; imageUrl: string | null }
      >;
    }
  >;
}

export function useCampaignStats(
  id: string | undefined,
  options?: { timeframeDays?: number; startDate?: string; endDate?: string },
) {
  const timeframeDays = options?.timeframeDays;
  const startDate = options?.startDate;
  const endDate = options?.endDate;

  return useQuery({
    queryKey: ['campaigns', id, 'stats', { timeframeDays, startDate, endDate }],
    queryFn: () => {
      let url = `/v1/campaigns/${id}/stats`;
      const params = new URLSearchParams();
      if (startDate && endDate) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      } else if (timeframeDays) {
        params.set('timeframe', timeframeDays.toString());
      }
      const qStr = params.toString();
      if (qStr) {
        url += `?${qStr}`;
      }
      return apiFetch<CampaignStatsResponse>(url);
    },
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
      geoRegions?: string[];
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

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        creativeIds?: string[];
        categories?: string[];
        geoRegions?: string[];
        schedule?: {
          startsAt: string;
          endsAt: string;
        };
        budget?: {
          totalIsk: number;
        };
        status?: 'active' | 'paused';
      };
    }) =>
      apiFetch<Campaign>(`/v1/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaigns', variables.id] });
    },
  });
}

export function useExtendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endsAt }: { id: string; endsAt: string }) =>
      apiFetch<Campaign>(`/v1/campaigns/${id}/extend`, {
        method: 'POST',
        body: JSON.stringify({ endsAt }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/**
 * Owner approval flow for a campaign an agent bought (over MCP/API) above
 * its API key's auto-approve limit — tagged `pendingReason: 'agent_purchase'`
 * (see services/campaigns.ts). Dashboard/ID-token auth only; the API rejects
 * `ak_` keys from these endpoints.
 */
export function useApproveCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Campaign>(`/v1/campaigns/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useRejectCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Campaign>(`/v1/campaigns/${id}/reject`, { method: 'POST' }),
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

export interface BulkCreativeStats {
  [creativeId: string]: { impressions: number; clicks: number; ctr: number };
}

export function useBulkCreativeStats(enabled = true) {
  return useQuery({
    queryKey: ['creatives', 'bulk-stats'],
    queryFn: () => apiFetch<BulkCreativeStats>('/v1/creatives/stats?hours=168'),
    enabled,
  });
}
