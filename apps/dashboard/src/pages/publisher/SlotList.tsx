import { useNavigate } from 'react-router-dom';
import { usePublisherSlots, usePublishers } from '@/hooks/usePublisher';
import { useSiteFilter } from '@/hooks/useSiteFilter';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { EditorialH1 } from '@/components/ui/editorial';
import { formatIsk } from '@/lib/format';
import { AD_CATEGORIES, publisherNetIsk, type Publisher, type Slot } from '@ada/shared';
import { Grid3x3, Plus, FolderPlus } from 'lucide-react';

// Publisher.status → sites.dc.html's siteStatusMeta(). 'active' maps to the
// template's own 'active' → success/Virkur mock exactly. 'suspended' has no
// counterpart in the template (its mock sites are only 'active' | 'review'),
// so it's added honestly rather than mislabeled as one of those two.
function siteStatusMeta(status: Publisher['status']): {
  variant: 'success' | 'danger';
  label: string;
} {
  return status === 'active'
    ? { variant: 'success', label: 'Virkur' }
    : { variant: 'danger', label: 'Stöðvaður' };
}

// Slot.status → sites.dc.html's statusMeta() for the per-slot rows. Real
// SlotStatusSchema is only 'active' | 'paused' — narrower than the template's
// mocked 'active' | 'review' | 'pending'. 'paused' keeps the pre-redesign
// page's own "Óvirkt" wording (neutral) rather than borrowing the template's
// "Í bið" (pending/awaiting review), which describes a different real state.
function slotStatusMeta(status: Slot['status']): {
  variant: 'success' | 'neutral';
  label: string;
} {
  return status === 'active'
    ? { variant: 'success', label: 'Virkt' }
    : { variant: 'neutral', label: 'Óvirkt' };
}

export default function SlotList() {
  const navigate = useNavigate();
  const { data: slots, isLoading: isSlotsLoading } = usePublisherSlots();
  // Site grouping (domain, category) needs Publisher data — Slot only carries
  // publisherId. usePublishers() is not a new API call: it's the same hook
  // already used by the sibling SlotCreate.tsx and Dashboard.tsx pages for
  // this exact multi-site purpose.
  const { data: publishers, isLoading: isPubsLoading } = usePublishers();
  const { siteId } = useSiteFilter();

  if (isSlotsLoading || isPubsLoading) return <LoadingState />;

  const sites = publishers ?? [];
  const filteredSites = sites.filter((site) => !siteId || site.id === siteId);

  if (!sites || sites.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <EditorialH1>Vefir</EditorialH1>
        <EmptyState
          icon={<Grid3x3 size={44} />}
          title="Engin auglýsingapláss fundust"
          description="Búðu til þitt fyrsta pláss til að geta fellt það inn á vefsíðuna þína og byrjað að fá greitt."
          action={
            <Button onClick={() => navigate('/publisher/slots/new')} className="font-bold">
              <Plus size={16} className="mr-1" />
              Búa til pláss
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div
      className="w-full"
      style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(32px,4vw,48px)' }}
    >
      {/* ===== PAGE HEADER =====
          Title + "{count} vefir skráðir" copied verbatim from sites.dc.html.
          The template's own header action ("Skrá nýjan vef" → onboarding) is
          kept as the primary button; the pre-redesign page's "Búa til pláss"
          (new slot) action is not in the template but is kept and restyled,
          same "kept, never deleted" precedent as the publisher Dashboard.tsx
          sibling's "Nýr vefur"/"Nýtt pláss" pair. */}
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <EditorialH1>Vefir</EditorialH1>
          <p className="mt-3 text-[15px] text-slate-500">{filteredSites.length} vefir skráðir</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/publisher/onboarding')}
            className="flex items-center gap-2 text-xs"
          >
            <FolderPlus size={16} />
            <span>Skrá nýjan vef</span>
          </Button>
          <Button
            onClick={() => navigate('/publisher/slots/new')}
            className="flex items-center gap-2 text-xs"
          >
            <Plus size={16} />
            <span>Búa til pláss</span>
          </Button>
        </div>
      </header>

      {/* ===== SITE CARDS =====
          Card shape (domain + status badge + category, impressions/revenue
          figures, "Skoða kóða"/"Fjarlægja" actions, and a per-slot status
          list underneath) copied verbatim from sites.dc.html. Site-level
          impressions/revenue are real: summed from each site's slots'
          already-fetched 30-day .stats (the same field the publisher
          Dashboard.tsx sibling reads), net of the platform fee for revenue —
          not a new fetch. */}
      <div className="flex flex-col gap-[22px]">
        {filteredSites.map((site) => {
          const siteSlots = (
            (slots ?? []) as (Slot & { stats?: { impressions: number; spendIsk: number } })[]
          ).filter((s) => s.publisherId === site.id);
          const status = siteStatusMeta(site.status);
          const categoryLabel =
            site.categories.length > 0
              ? site.categories
                  .map((cat) => AD_CATEGORIES.find((a) => a.slug === cat)?.label || cat)
                  .join(', ')
              : 'Almennt';

          const totalImpressions = siteSlots.reduce(
            (sum, s) => sum + (s.stats?.impressions || 0),
            0,
          );
          const totalGrossIsk = siteSlots.reduce((sum, s) => sum + (s.stats?.spendIsk || 0), 0);
          const totalNetIsk = publisherNetIsk(totalGrossIsk);

          // "Skoða kóða" opens the embed snippet for this site — the
          // real snippet/copy affordance is per-slot (SlotDetail.tsx), so
          // this routes to the site's first slot rather than inventing a
          // combined site-wide code block that doesn't exist in the data
          // model. Disabled when the site has no slots yet (nothing to view).
          const firstSlot = siteSlots[0];

          return (
            <div
              key={site.id}
              className="rounded-card border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="flex min-w-[200px] flex-col gap-1.5">
                  <div className="flex items-center gap-2.5">
                    <h3 className="m-0 text-[17px] font-bold tracking-[-0.01em] text-slate-900">
                      {site.domain}
                    </h3>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <span className="text-[13px] text-slate-500">{categoryLabel}</span>
                </div>

                <div className="flex flex-wrap gap-9">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">
                      Birtingar
                    </div>
                    <div className="mt-1.5 text-[17px] font-bold tabular-nums text-slate-900">
                      {totalImpressions > 0 ? totalImpressions.toLocaleString('is-IS') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">
                      Tekjur
                    </div>
                    <div className="mt-1.5 text-[17px] font-bold tabular-nums text-slate-900">
                      {totalNetIsk > 0 ? formatIsk(totalNetIsk) : '—'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <Button
                    variant="secondary"
                    disabled={!firstSlot}
                    onClick={() => firstSlot && navigate(`/publisher/slots/${firstSlot.id}`)}
                    className="text-xs"
                  >
                    Skoða kóða
                  </Button>
                  {/* Remove-site control omitted: no delete-publisher endpoint exists. */}
                </div>
              </div>

              <div className="mt-[22px] border-t border-slate-100 pt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">
                  Auglýsingapláss
                </p>
                {siteSlots.length === 0 ? (
                  <p className="text-sm text-slate-400">Engin pláss skráð fyrir þennan vef.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {siteSlots.map((s) => {
                      const slotStatus = slotStatusMeta(s.status);
                      const sizeLabel = s.sizes.map((sz) => `${sz.width}×${sz.height}`).join(', ');
                      return (
                        <div
                          key={s.id}
                          className="flex cursor-pointer items-center justify-between"
                          onClick={() => navigate(`/publisher/slots/${s.id}`)}
                        >
                          <span className="text-sm text-slate-700">
                            {s.name} — {sizeLabel}
                          </span>
                          <Badge variant={slotStatus.variant}>{slotStatus.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
