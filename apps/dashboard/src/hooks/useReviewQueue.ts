import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Creative, Payout } from '@ada/shared';

// Creative Review Queue
export function useReviewQueue() {
  return useQuery({
    queryKey: ['admin', 'review-queue'],
    queryFn: () =>
      apiFetch<{ queue: Creative[] }>('/v1/admin/review-queue/queue').then((r) => r.queue),
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
      apiFetch<{ creative: Creative }>(`/v1/admin/review-queue/${creativeId}`, {
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
    queryFn: () =>
      apiFetch<{ payouts: Payout[] }>('/v1/admin/payouts/pending').then((r) => r.payouts),
  });
}

export function useMarkPayoutCompleted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payoutId, bankReference }: { payoutId: string; bankReference: string }) =>
      apiFetch<{ payout: Payout }>(`/v1/admin/payouts/${payoutId}/mark-completed`, {
        method: 'POST',
        body: JSON.stringify({ bankReference }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'payouts', 'pending'] });
    },
  });
}
