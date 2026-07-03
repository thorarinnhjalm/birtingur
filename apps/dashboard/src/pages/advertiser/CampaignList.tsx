import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { EditorialH1 } from '@/components/ui/editorial';
import { Megaphone, Plus } from 'lucide-react';
import { AD_CATEGORIES } from '@ada/shared';

// Icelandic dot-grouped integer (no currency suffix — "kr." is appended
// separately, matching campaigns.dc.html's own fmt()). Same pattern as the
// already-redesigned CampaignCreate.tsx's local fmtNum; kept local here too
// since neither pre-redesign file shared one.
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('is-IS', { maximumFractionDigits: 0 });
}

// Real campaign statuses per CampaignStatusSchema (@ada/shared): draft,
// pending_approval, active, paused, completed. Copied verbatim from the
// already-redesigned Dashboard.tsx sibling's STATUS_MAP so both screens agree
// on label/variant for every real status. draft/active/paused labels match
// campaigns.dc.html's own mock statuses (Drög/Virk/Í hléi) exactly;
// pending_approval maps to the template's "review" mock label (Í yfirferð).
// completed and the template's mocked 'pending'/'rejected' statuses have no
// counterpart on the real Campaign type in either direction, so completed
// keeps Dashboard.tsx's label rather than inventing new copy.
const STATUS_MAP: Record<
  string,
  { label: string; variant: 'success' | 'pending' | 'danger' | 'info' | 'neutral' }
> = {
  active: { label: 'Virk', variant: 'success' },
  pending_approval: { label: 'Í yfirferð', variant: 'info' },
  paused: { label: 'Í hléi', variant: 'neutral' },
  draft: { label: 'Drög', variant: 'neutral' },
  completed: { label: 'Lokið', variant: 'neutral' },
};

// Filter-tab grouping — mirrors campaigns.dc.html's groupOf(): active is its
// own group, pending_approval is the template's "review/pending → progress"
// group, everything else (draft, paused, completed) groups as inactive.
type FilterKey = 'all' | 'active' | 'progress' | 'inactive';
function groupOf(status: string): 'active' | 'progress' | 'inactive' {
  if (status === 'active') return 'active';
  if (status === 'pending_approval') return 'progress';
  return 'inactive';
}

export default function CampaignList() {
  const navigate = useNavigate();
  const { data: campaigns, isLoading } = useCampaigns();
  const [filter, setFilter] = useState<FilterKey>('all');

  if (isLoading) return <LoadingState />;

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <EditorialH1>Herferðir</EditorialH1>
        <EmptyState
          icon={<Megaphone size={44} />}
          title="Engar herferðir fundust"
          description="Þú hefur ekki stofnað neina auglýsingaherferð ennþá. Stofnaðu nýja herferð til að birta á íslenskum vefjum."
          action={
            <Button onClick={() => navigate('/advertiser/campaigns/new')} className="font-bold">
              <Plus size={16} className="mr-1" />
              Stofna herferð
            </Button>
          }
        />
      </div>
    );
  }

  const counts = { all: campaigns.length, active: 0, progress: 0, inactive: 0 };
  campaigns.forEach((c) => {
    counts[groupOf(c.status)]++;
  });

  const visible =
    filter === 'all' ? campaigns : campaigns.filter((c) => groupOf(c.status) === filter);

  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'Allar', count: counts.all },
    { key: 'active', label: 'Virkar', count: counts.active },
    { key: 'progress', label: 'Í vinnslu', count: counts.progress },
    { key: 'inactive', label: 'Óvirkar', count: counts.inactive },
  ];

  return (
    <div
      className="w-full"
      style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(32px,4vw,48px)' }}
    >
      {/* ===== PAGE HEADER ===== */}
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <EditorialH1>Herferðir</EditorialH1>
          <p className="mt-3 text-[15px] text-slate-500">{campaigns.length} herferðir samtals</p>
        </div>
        <Button onClick={() => navigate('/advertiser/campaigns/new')}>Ný herferð</Button>
      </header>

      {/* ===== FILTER TABS ===== */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`cursor-pointer rounded-full px-[18px] py-[9px] text-sm font-semibold transition-colors ${
              filter === tab.key ? 'bg-primary text-white' : 'text-slate-600'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ===== CAMPAIGN TABLE =====
          Column set (Herferð / Staða / Framvinda / Birtingar / Eytt) and row
          treatment (22px vertical padding, hairline dividers, tabular
          numerals, em-dash for missing values) copied from campaigns.dc.html.

          Row click preserves the original page's only handler — navigate to
          the campaign detail page — instead of the template's inline
          expand-to-detail-panel interaction. That panel's Pause/Resume
          actions call useUpdateCampaign, a mutation this page never used
          before (only useCampaigns did); the binding "data layer verbatim /
          presentation only" constraint for this pass rules out adding new
          mutations here. Pause/Resume already exists in full on
          CampaignDetail.tsx (Play/Pause button, same useUpdateCampaign call),
          reachable through this exact preserved navigate handler. The
          panel's other, read-only fields (Tímabil, Smellir, CTR, Fjárhæð)
          are dropped from the list for the same reason — they lived inside
          the now-omitted expand panel — and are one click away on that same
          detail page. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-outline-variant py-3.5 pr-4 text-left text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                Herferð
              </th>
              <th className="border-b border-outline-variant px-4 py-3.5 text-left text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                Staða
              </th>
              <th className="w-[180px] border-b border-outline-variant px-4 py-3.5 text-left text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                Framvinda
              </th>
              <th className="border-b border-outline-variant px-4 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                Birtingar
              </th>
              <th className="border-b border-outline-variant py-3.5 pl-4 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                Eytt
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const spent = c.budget.totalIsk - c.budget.remainingIsk;
              const pct = Math.min(100, Math.round((spent / c.budget.totalIsk) * 100)) || 0;
              const hasProgress = c.status === 'active' || c.status === 'paused';
              const status = STATUS_MAP[c.status] ?? {
                label: c.status,
                variant: 'neutral' as const,
              };
              const categoryLabel =
                c.targeting.categories.length > 0
                  ? c.targeting.categories
                      .map((cat) => AD_CATEGORIES.find((a) => a.slug === cat)?.label || cat)
                      .join(', ')
                  : 'Almennt';

              return (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/advertiser/campaigns/${c.id}`)}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                >
                  <td className="border-b border-surface-container py-[22px] pr-4 align-middle">
                    <div className="text-[15px] font-semibold text-slate-900">
                      {c.name || `Herferð ${c.id.substring(0, 8)}`}
                    </div>
                    <div className="mt-[3px] text-[13px] text-slate-500">{categoryLabel}</div>
                  </td>
                  <td className="border-b border-surface-container px-4 py-[22px] align-middle">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td className="border-b border-surface-container px-4 py-[22px] align-middle">
                    {hasProgress ? (
                      <div>
                        <div className="h-[5px] overflow-hidden rounded-full bg-surface-container">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-1.5 text-xs text-slate-400 tabular-nums">
                          {fmtNum(spent)} / {fmtNum(c.budget.totalIsk)} kr.
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>
                  {/* Birtingar (impressions): Campaign has no per-campaign
                      impressions field. Populating this column would need
                      either an N+1 call to /v1/campaigns/{id}/stats per row,
                      or wiring useBulkCreativeStats (not fetched on this page
                      today) and summing per campaign's creativeIds — both are
                      new fetches this presentation-only pass may not add.
                      Column kept per spec layout; always shows the em dash,
                      the same convention the template itself uses for
                      campaigns with zero impressions (e.g. its own mock 'c4'
                      draft rows). */}
                  <td className="border-b border-surface-container px-4 py-[22px] text-right align-middle text-[15px] text-slate-400 tabular-nums">
                    —
                  </td>
                  <td className="border-b border-surface-container py-[22px] pl-4 text-right align-middle text-[15px] font-semibold text-slate-900 tabular-nums">
                    {spent > 0 ? `${fmtNum(spent)} kr.` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
