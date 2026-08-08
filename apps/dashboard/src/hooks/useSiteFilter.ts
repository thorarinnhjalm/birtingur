import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePublishers } from './usePublisher';

const STORAGE_KEY = 'birtingur.siteFilter';

/**
 * Publisher-area site filter. Canonical value lives in the URL (?site=pub_x)
 * so filtered views are linkable; sessionStorage mirrors it so the choice
 * survives sidebar navigation (which drops query params). Ids that don't
 * belong to the signed-in owner resolve to null (= "Allir vefir").
 */
export function useSiteFilter(): {
  siteId: string | null;
  setSiteId: (id: string | null) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: publishers } = usePublishers();

  const raw = searchParams.get('site') ?? sessionStorage.getItem(STORAGE_KEY);
  const siteId = raw && publishers?.some((p) => p.id === raw) ? raw : null;

  const setSiteId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('site', id);
          else next.delete('site');
          return next;
        },
        { replace: true },
      );
      if (id) sessionStorage.setItem(STORAGE_KEY, id);
      else sessionStorage.removeItem(STORAGE_KEY);
    },
    [setSearchParams],
  );

  return { siteId, setSiteId };
}
