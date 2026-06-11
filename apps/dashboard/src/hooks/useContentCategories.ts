import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface ContentCategory {
  slug: string;
  label: string;
}

export function useContentCategories() {
  return useQuery<ContentCategory[]>({
    queryKey: ['categories', 'content'],
    queryFn: () => apiFetch<ContentCategory[]>('/v1/categories/content'),
  });
}
