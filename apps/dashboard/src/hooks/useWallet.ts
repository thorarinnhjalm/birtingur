import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface Wallet {
  advertiserId: string;
  balanceIsk: number;
}

export function useWallet(enabled = true) {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiFetch<Wallet>('/v1/advertisers/me/wallet'),
    enabled,
    retry: false,
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
      qc.invalidateQueries({ queryKey: ['wallet', 'transactions'] });
    },
  });
}

export interface WalletTransaction {
  id: string;
  type: 'topup' | 'refund';
  amountIsk: number;
  relatedId: string;
  createdAt: string;
}

export function useWalletTransactions(enabled = true) {
  return useQuery({
    queryKey: ['wallet', 'transactions'],
    queryFn: () => apiFetch<WalletTransaction[]>('/v1/advertisers/me/wallet/transactions'),
    enabled,
  });
}
