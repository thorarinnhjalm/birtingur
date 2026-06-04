import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Publisher, Slot } from '@ada/shared';

export function usePublisher() {
  return useQuery({
    queryKey: ['publisher', 'me'],
    queryFn: () => apiFetch<{ publisher: Publisher }>('/v1/publishers/me').then((r) => r.publisher),
    retry: false, // Don't retry since 404 means onboarding is needed
  });
}

export function useCreatePublisher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      domain: string;
      displayName: string;
      category: string;
      payoutDetails?: {
        kennitala: string;
        iban: string;
        accountHolder: string;
      };
      minimumPayoutIsk: number;
    }) =>
      apiFetch<{ publisher: Publisher }>('/v1/publishers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publisher', 'me'] });
    },
  });
}

export function usePublisherSlots() {
  return useQuery({
    queryKey: ['publisher', 'slots'],
    queryFn: () => apiFetch<{ slots: Slot[] }>('/v1/publishers/me/slots').then((r) => r.slots),
  });
}

export function usePublisherSlot(id: string | undefined) {
  return useQuery({
    queryKey: ['publisher', 'slots', id],
    queryFn: () => apiFetch<{ slot: Slot }>(`/v1/publishers/me/slots/${id}`).then((r) => r.slot),
    enabled: !!id,
  });
}

export function useCreateSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      sizes: { width: number; height: number }[];
      pricing: {
        mode: 'cpm';
        cpmIsk: number;
      };
      targeting: {
        regions?: string[];
        categories?: string[];
      };
      autoApprove: boolean;
    }) =>
      apiFetch<{ slot: Slot }>('/v1/publishers/me/slots', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publisher', 'slots'] });
    },
  });
}

// Global slots list search for advertisers creating campaigns
export function useSearchSlots() {
  return useQuery({
    queryKey: ['slots', 'search'],
    queryFn: () => apiFetch<{ slots: Slot[] }>('/v1/slots/search').then((r) => r.slots),
  });
}
