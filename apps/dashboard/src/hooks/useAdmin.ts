import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Publisher, Advertiser, Slot, Campaign, Creative, LedgerEntry } from '@ada/shared';

// 1. Fetch publishers for admin
export function useAdminPublishers() {
  return useQuery({
    queryKey: ['admin', 'publishers'],
    queryFn: () => apiFetch<Publisher[]>('/v1/admin/entities/publishers'),
  });
}

// 2. Fetch advertisers for admin
export function useAdminAdvertisers() {
  return useQuery({
    queryKey: ['admin', 'advertisers'],
    queryFn: () => apiFetch<Advertiser[]>('/v1/admin/entities/advertisers'),
  });
}

// 3. Fetch slots for admin
export function useAdminSlots() {
  return useQuery({
    queryKey: ['admin', 'slots'],
    queryFn: () => apiFetch<Slot[]>('/v1/admin/entities/slots'),
  });
}

// 4. Mutation to update status of publisher, advertiser, or slot
export function useUpdateEntityStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      id,
      status,
    }: {
      type: 'publisher' | 'advertiser' | 'slot';
      id: string;
      status: 'active' | 'suspended' | 'paused';
    }) => {
      const endpoint = `/v1/admin/entities/${type}s/${id}/status`;
      return apiFetch<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate specific cache and list cache
      qc.invalidateQueries({ queryKey: ['admin', `${variables.type}s`] });
    },
  });
}

// 5. Mutation to trigger manual payouts generation
export function useGeneratePayouts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodStart, periodEnd }: { periodStart: string; periodEnd: string }) =>
      apiFetch<{ created: number }>('/v1/admin/payouts/generate', {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'payouts', 'pending'] });
    },
  });
}

// 6. Fetch admin diagnostics
export function useAdminDiagnostics() {
  return useQuery({
    queryKey: ['admin', 'diagnostics'],
    queryFn: () => apiFetch<any>('/v1/admin/diagnostics'),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

// 7. Mutation to top up advertiser wallet balance
export function useAdminTopUpAdvertiser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ advertiserId, amountIsk }: { advertiserId: string; amountIsk: number }) =>
      apiFetch<any>(`/v1/admin/entities/advertisers/${advertiserId}/topup`, {
        method: 'POST',
        body: JSON.stringify({ amountIsk }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'advertisers'] });
    },
  });
}

// 8. Fetch all campaigns for admin
export function useAdminCampaigns() {
  return useQuery({
    queryKey: ['admin', 'campaigns'],
    queryFn: () => apiFetch<Campaign[]>('/v1/admin/entities/campaigns'),
  });
}

// 9. Fetch all creatives for admin
export function useAdminCreatives() {
  return useQuery({
    queryKey: ['admin', 'creatives'],
    queryFn: () => apiFetch<Creative[]>('/v1/admin/entities/creatives'),
  });
}

// 10. Fetch all ledger entries for admin
export function useAdminLedger() {
  return useQuery({
    queryKey: ['admin', 'ledger'],
    queryFn: () => apiFetch<LedgerEntry[]>('/v1/admin/entities/ledger'),
  });
}

// 11. Mutation to delete an entity (publisher, advertiser, slot, campaign, creative)
export function useDeleteEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      id,
    }: {
      type: 'publisher' | 'advertiser' | 'slot' | 'campaign' | 'creative';
      id: string;
    }) =>
      apiFetch<any>(`/v1/admin/entities/${type}s/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['admin', `${variables.type}s`] });
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
      // If we delete campaigns or slots, we might need to invalidate active review queues too
      if (variables.type === 'creative') {
        qc.invalidateQueries({ queryKey: ['admin', 'review-queue'] });
      }
    },
  });
}

// 12. Mutation to pause/resume campaign
export function useUpdateCampaignStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, status }: { campaignId: string; status: 'active' | 'paused' }) =>
      apiFetch<any>(`/v1/admin/entities/campaigns/${campaignId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'campaigns'] });
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

// 13. Mutation to refresh all active slot caches
export function useRefreshCache() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; count: number }>('/v1/admin/cache/refresh', {
        method: 'POST',
      }),
  });
}

// Waitlist signups from the English marketing site (/en) — aggregated by
// GET /v1/admin/waitlist/stats (admin-gated, see apps/api routes/admin).
export interface AdminWaitlistStats {
  total: number;
  roles: { advertisers: number; publishers: number; both: number };
  categories: Record<string, number>;
}

export function useAdminWaitlistStats() {
  return useQuery({
    queryKey: ['admin', 'waitlist-stats'],
    queryFn: () => apiFetch<AdminWaitlistStats>('/v1/admin/waitlist/stats'),
  });
}
