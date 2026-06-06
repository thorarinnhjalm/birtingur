import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useContentCategories() {
  return useQuery<string[]>({
    queryKey: ['categories', 'content'],
    queryFn: () => apiFetch<string[]>('/v1/categories/content'),
  });
}
