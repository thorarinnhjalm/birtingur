import { usePublishers } from '@/hooks/usePublisher';
import { useSiteFilter } from '@/hooks/useSiteFilter';

export function SiteSwitcher() {
  const { data: publishers } = usePublishers();
  const { siteId, setSiteId } = useSiteFilter();

  if (!publishers || publishers.length < 2) return null;

  return (
    <select
      aria-label="Velja vef"
      value={siteId ?? ''}
      onChange={(e) => setSiteId(e.target.value || null)}
      className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:border-slate-300 transition cursor-pointer max-w-[220px]"
    >
      <option value="">Allir vefir</option>
      {publishers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.displayName} — {p.domain}
        </option>
      ))}
    </select>
  );
}
