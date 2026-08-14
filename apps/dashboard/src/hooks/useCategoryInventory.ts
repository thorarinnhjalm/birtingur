import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface CategoryInventory {
  category: string;
  avgDailyImpressions: number;
  committedDailyImpressions: number;
  availableDailyImpressions: number;
}

export function useCategoryInventory() {
  return useQuery({
    queryKey: ['categories', 'inventory'],
    queryFn: () => apiFetch<CategoryInventory[]>('/v1/categories/inventory'),
  });
}

export interface CombinedCategoryInventory {
  avgDailyImpressions: number;
  committedDailyImpressions: number;
  availableDailyImpressions: number;
}

/**
 * Availability across a SELECTION of categories.
 *
 * The per-category figures above are NOT additive: a publisher's whole daily
 * volume is reported under every category it declares, so summing the rows for
 * a multi-category selection counts that publisher once per category. This
 * endpoint deduplicates server-side, where the publisher identities still
 * exist.
 */
export function useCombinedCategoryInventory(categories: string[]) {
  const key = [...categories].sort().join(',');
  return useQuery({
    queryKey: ['categories', 'inventory', 'combined', key],
    queryFn: () =>
      apiFetch<CombinedCategoryInventory>(
        `/v1/categories/inventory/combined?categories=${encodeURIComponent(key)}`,
      ),
    enabled: categories.length > 0,
    // The key changes on every category the advertiser clicks, so without this
    // each click drops to `undefined` and the caller reads 0 available — which
    // renders as "um 0 lausar birtingar á dag" and fires the oversell warning
    // for as long as the request takes. Keeping the previous answer visible is
    // stale for a moment; showing zero is wrong.
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}
