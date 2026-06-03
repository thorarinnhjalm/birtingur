import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Advertiser } from '@ada/shared';

export function useAdvertiser() {
  return useQuery({
    queryKey: ['advertiser', 'me'],
    queryFn: () =>
      apiFetch<{ advertiser: Advertiser }>('/v1/advertisers/me').then((r) => r.advertiser),
    retry: false, // Don't retry since 404 means we need onboarding
  });
}

export function useCreateAdvertiser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      companyName: string;
      kennitala: string;
      vatNumber: string;
      billingEmail: string;
    }) =>
      apiFetch<{ advertiser: Advertiser }>('/v1/advertisers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['advertiser', 'me'] });
    },
  });
}
