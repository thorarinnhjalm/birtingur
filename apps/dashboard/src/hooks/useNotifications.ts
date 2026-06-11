import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface Notification {
  id: string;
  userEmail: string;
  role: 'advertiser' | 'publisher' | 'admin';
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  read: boolean;
  createdAt: string; // Serialized Date from JSON
  link?: string;
}

export function useNotifications(role: 'advertiser' | 'publisher' | 'admin', enabled = true) {
  return useQuery<Notification[]>({
    queryKey: ['notifications', role],
    queryFn: () => apiFetch<Notification[]>(`/v1/notifications?role=${role}`),
    enabled: enabled && !!role,
    refetchInterval: 30000, // Poll every 30 seconds
    retry: false,
  });
}

export function useMarkNotificationRead(role: 'advertiser' | 'publisher' | 'admin') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/v1/notifications/${id}/read`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', role] });
    },
  });
}

export function useMarkAllNotificationsRead(role: 'advertiser' | 'publisher' | 'admin') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>('/v1/notifications/read-all', {
        method: 'POST',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', role] });
    },
  });
}
