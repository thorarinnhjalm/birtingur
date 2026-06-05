import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Publisher, Slot, Pricing } from '@ada/shared';

export function usePublisher() {
  return useQuery({
    queryKey: ['publisher', 'me'],
    queryFn: () => apiFetch<Publisher>('/v1/publishers/me'),
    retry: false, // Don't retry since 404 means onboarding is needed
  });
}

export function useCreatePublisher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      domain: string;
      displayName: string;
      categories: string[];
      payoutDetails?: {
        kennitala: string;
        iban: string;
        accountHolder: string;
      };
      minimumPayoutIsk: number;
      integrationPreference?: 'widget' | 'mcp' | 'both';
      estimatedSlotsCount?: number;
    }) =>
      apiFetch<Publisher>('/v1/publishers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publisher', 'me'] });
    },
  });
}

export function usePublisherSlots(enabled = true) {
  return useQuery({
    queryKey: ['publisher', 'slots'],
    queryFn: () => apiFetch<Slot[]>('/v1/publishers/me/slots'),
    enabled,
    retry: false,
  });
}

export function usePublisherSlot(id: string | undefined) {
  return useQuery({
    queryKey: ['publisher', 'slots', id],
    queryFn: () => apiFetch<Slot>(`/v1/publishers/me/slots/${id}`),
    enabled: !!id,
  });
}

export function useCreateSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      sizes: { width: number; height: number }[];
      pricing: Pricing;
      targeting: {
        regions?: string[];
        categories?: string[];
      };
      autoApprove: boolean;
    }) =>
      apiFetch<Slot>('/v1/publishers/me/slots', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publisher', 'slots'] });
    },
  });
}
