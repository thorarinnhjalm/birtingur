import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Publisher, Advertiser, Slot } from '@ada/shared';

// 1. Fetch publishers for admin
export function useAdminPublishers() {
  return useQuery({
    queryKey: ['admin', 'publishers'],
    queryFn: () =>
      apiFetch<{ publishers: Publisher[] }>('/v1/admin/entities/publishers').then(
        (r) => r.publishers,
      ),
  });
}

// 2. Fetch advertisers for admin
export function useAdminAdvertisers() {
  return useQuery({
    queryKey: ['admin', 'advertisers'],
    queryFn: () =>
      apiFetch<{ advertisers: Advertiser[] }>('/v1/admin/entities/advertisers').then(
        (r) => r.advertisers,
      ),
  });
}

// 3. Fetch slots for admin
export function useAdminSlots() {
  return useQuery({
    queryKey: ['admin', 'slots'],
    queryFn: () => apiFetch<{ slots: Slot[] }>('/v1/admin/entities/slots').then((r) => r.slots),
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
