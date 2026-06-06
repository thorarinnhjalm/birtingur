import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Publisher, Advertiser, Slot } from '@ada/shared';

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
