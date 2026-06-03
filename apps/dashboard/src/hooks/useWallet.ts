import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface Wallet {
  advertiserId: string;
  balanceIsk: number;
}

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiFetch<{ wallet: Wallet }>('/v1/advertisers/me/wallet').then((r) => r.wallet),
  });
}

export function useTopUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amountIsk: number) =>
      apiFetch<{ checkoutUrl: string; sessionId: string }>('/v1/advertisers/me/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amountIsk }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
