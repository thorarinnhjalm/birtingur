import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Creative, Payout } from '@ada/shared';

// Creative Review Queue
export function useReviewQueue() {
  return useQuery({
    queryKey: ['admin', 'review-queue'],
    queryFn: () => apiFetch<Creative[]>('/v1/admin/review-queue/queue'),
  });
}

export function useReviewCreative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      creativeId,
      action,
      reason,
    }: {
      creativeId: string;
      action: 'approve' | 'reject';
      reason?: string;
    }) =>
      apiFetch<Creative>(`/v1/admin/review-queue/${creativeId}`, {
        method: 'POST',
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'review-queue'] });
    },
  });
}

// Payouts Admin Management
export function usePendingPayouts() {
  return useQuery({
    queryKey: ['admin', 'payouts', 'pending'],
    queryFn: () => apiFetch<Payout[]>('/v1/admin/payouts/pending'),
  });
}

export function useMarkPayoutCompleted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payoutId, bankReference }: { payoutId: string; bankReference: string }) =>
      apiFetch<Payout>(`/v1/admin/payouts/${payoutId}/mark-completed`, {
        method: 'POST',
        body: JSON.stringify({ bankReference }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'payouts', 'pending'] });
    },
  });
}
