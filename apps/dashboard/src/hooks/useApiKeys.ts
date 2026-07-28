import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

/**
 * Mirrors `ApiKeyPurchaseConfig` in apps/api/src/services/api-keys.ts. The
 * list endpoint (`GET /v1/api-keys`) only ever returns the three base
 * fields — `monthToDateSpentIsk`/`remainingCapIsk` are derived only by
 * `GET /v1/api-keys/me`, which reports them for whichever key authenticated
 * the request (i.e. only useful to an agent calling as itself, not the
 * dashboard owner browsing via ID token). They're kept optional here so the
 * UI renders them if a future endpoint ever attaches them to a list item,
 * without requiring it.
 */
export interface ApiKeyPurchaseConfig {
  enabled: boolean;
  monthlyCapIsk: number;
  autoApproveLimitIsk: number;
  monthToDateSpentIsk?: number;
  remainingCapIsk?: number;
}

export interface ApiKeyRecord {
  id: string;
  ownerEmail: string;
  scope: 'advertiser' | 'publisher' | 'both';
  createdAt: string;
  lastUsedAt?: string;
  revoked: boolean;
  purchase?: ApiKeyPurchaseConfig;
}

export function useApiKeys(enabled = true) {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch<ApiKeyRecord[]>('/v1/api-keys'),
    enabled,
  });
}

export function useIssueApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scope: 'advertiser' | 'publisher' | 'both') =>
      apiFetch<{ apiKeyId: string; apiKey: string; warning: string }>('/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({ scope }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export interface ApiKeyPurchaseInput {
  id: string;
  enabled: boolean;
  monthlyCapIsk: number;
  autoApproveLimitIsk: number;
}

/**
 * Dashboard/ID-token-only guardrail update (PATCH /v1/api-keys/:id/purchase,
 * apps/api/src/routes/api-keys.ts) — the API itself rejects calls
 * authenticated with an `ak_` key so an agent can never widen its own cap.
 */
export function useUpdateApiKeyPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...cfg }: ApiKeyPurchaseInput) =>
      apiFetch<ApiKeyRecord>(`/v1/api-keys/${id}/purchase`, {
        method: 'PATCH',
        body: JSON.stringify(cfg),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}
