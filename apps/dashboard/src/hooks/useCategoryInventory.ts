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
