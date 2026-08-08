import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useSiteFilter } from '@/hooks/useSiteFilter';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { EditorialH1 } from '@/components/ui/editorial';
import { formatIsk } from '@/lib/format';
import { Calendar } from 'lucide-react';
import { DEFAULT_PLATFORM_FEE_PERCENT, MIN_PAYOUT_ISK, type Payout } from '@ada/shared';

interface StatsResponse {
  impressions: number;
  clicks: number;
  spendIsk: number;
  history: {
    date: string;
    impressions: number;
    clicks: number;
    spendIsk: number;
  }[];
}

export default function Earnings() {
  const navigate = useNavigate();
  const { siteId } = useSiteFilter();

  // /v1/publishers/stats (not /v1/publishers/me/stats) — the /me/ endpoint
  // resolves a single publisher doc, so a multi-site owner's Earnings totals
  // silently covered only their first-created site. /v1/publishers/stats
  // aggregates across all of the owner's sites when unfiltered, and narrows
  // to one when the SiteSwitcher sets siteId, same contract Dashboard.tsx
  // already uses.
  const { data: stats, isLoading: isStatsLoading } = useQuery<StatsResponse>({
    queryKey: ['publisher', 'stats', 30, siteId],
    queryFn: () =>
      apiFetch<StatsResponse>(
        `/v1/publishers/stats?timeframe=30${siteId ? `&publisherId=${siteId}` : ''}`,
      ),
  });

  const { data: payouts, isLoading: isPayoutsLoading } = useQuery<Payout[]>({
    queryKey: ['publisher', 'payouts'],
    queryFn: () => apiFetch<Payout[]>('/v1/publishers/me/payouts'),
  });

  if (isStatsLoading || isPayoutsLoading) return <LoadingState />;

  const earningsTotal = stats?.spendIsk || 0;
  const netEarningsTotal = Math.round(earningsTotal * (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100));
  const pendingPayoutIsk = netEarningsTotal >= MIN_PAYOUT_ISK ? netEarningsTotal : 0;
  const belowMinimum = netEarningsTotal > 0 && pendingPayoutIsk === 0;

  // Next payout date (1st of next month) — payout batches are generated on
  // the 1st per cron-payouts; hedged with "Áætlað" (not a confirmed
  // scheduled payout) matching the publisher Dashboard.tsx precedent.
  const now = new Date();
  const nextPayoutDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextPayoutLabel = nextPayoutDate.toLocaleDateString('is-IS', {
    day: 'numeric',
    month: 'long',
  });

  const publisherSharePercent = 100 - DEFAULT_PLATFORM_FEE_PERCENT;

  return (
    <div
      className="mx-auto max-w-4xl"
      style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(32px,4vw,48px)' }}
    >
      {/* ===== PAGE HEADER =====
          Title/subtitle copied verbatim from publisher-billing.dc.html, minus
          "og bankaupplýsingar" — the template's bank-account card (account
          number, kennitala) isn't backed by any query this page runs (no new
          API calls allowed), so that card is dropped below; the subtitle is
          trimmed to match what the page actually shows. */}
      <header>
        <EditorialH1>Greiðslur</EditorialH1>
        <p className="mt-3 text-[15px] text-slate-500">Útgreiðslusaga og greiðsluskilmálar</p>
      </header>

      {/* ===== STAT CARDS =====
          Labels and order copied verbatim from the template's three
          StatCards. Values are real: "Tekjur í mánuðinum" and "Beðið eftir
          útgreiðslu" both derive from the same 30-day net-revenue figure the
          pre-redesign page already computed (spendIsk minus the platform
          fee) — "Beðið eftir útgreiðslu" additionally applies the existing
          MIN_PAYOUT_ISK gate (renders 0 kr. below the minimum, same logic
          the pre-redesign page used for its "next payout" figure). */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard label="Tekjur í mánuðinum" value={formatIsk(netEarningsTotal)} />
        <StatCard label="Beðið eftir útgreiðslu" value={formatIsk(pendingPayoutIsk)} />
        <StatCard label="Næsta útgreiðsla" value={`Áætlað ${nextPayoutLabel}`} />
      </div>
      {belowMinimum && (
        <p className="-mt-6 text-[13px] text-slate-500">
          Lágmarksfjárhæð til útgreiðslu er {formatIsk(MIN_PAYOUT_ISK)} — núverandi staða er undir
          því marki, svo engin útgreiðsla fer fram að svo stöddu.
        </p>
      )}

      {/* ===== BANK ACCOUNT / TERMS =====
          The template's account-number card (IBAN, kennitala) shows
          publisher-specific data this page never fetches — that's managed
          on the Settings page (apps/dashboard/src/pages/publisher/Settings.tsx),
          which already reads/writes publisher.payoutMethod. Rather than
          fabricate numbers or add a new query, this links out to Settings
          instead. The revenue-share terms box below it is copied verbatim —
          80% / Mánaðarlega / 5.000 kr. are all real constants
          (DEFAULT_PLATFORM_FEE_PERCENT, MIN_PAYOUT_ISK), not fetched or
          invented. Completion is a manual bank transfer (see CLAUDE.md), so
          "Mánaðarlega" describes the payout cadence only, not automation. */}
      <section>
        <h2 className="m-0 mb-4 text-[19px] font-bold tracking-[-0.015em]">Bankareikningur</h2>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-slate-200 bg-white p-5">
          <div>
            <div className="text-[15px] font-semibold text-slate-900">
              Bankaupplýsingar eru skráðar í stillingum
            </div>
            <div className="mt-1 text-[13px] text-slate-500">
              Kennitala og bankareikningur sem útgreiðslur berast á
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate('/publisher/settings')}>
            Fara í stillingar
          </Button>
        </div>

        <div className="mt-4 flex max-w-[520px] flex-col gap-2 rounded-card border border-[#dbe4f7] bg-[#f1f5fd] p-6">
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Þitt hlutfall af tekjum</span>
            <span className="font-bold text-primary">{publisherSharePercent}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Útgreiðslur</span>
            <span className="font-bold text-slate-900">Mánaðarlega</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Lágmarksfjárhæð</span>
            <span className="font-bold text-slate-900">{formatIsk(MIN_PAYOUT_ISK)}</span>
          </div>
        </div>
      </section>

      {/* ===== PAYOUT HISTORY =====
          Section title copied verbatim. Table keeps the pre-redesign page's
          richer six-column shape (Tímabil/Auðkenni/Staða/Brúttó/Þóknun/
          Útborgun) rather than the template's plain three-column mock
          (Dagsetning/Fjárhæð/Staða) — strictly more real information from
          the same already-fetched payouts query, same "kept, not stripped"
          precedent as the publisher Dashboard.tsx ad-slots table. Restyled
          to the template's bare-table-on-page treatment (no Card wrapper,
          22px row padding, tabular numerals, hairline dividers) instead of
          the old Card-wrapped table. Status labels: "completed" → "Greitt"
          (the template's own wording for a settled payout); "processing" →
          "Í vinnslu" (the template's wording for its one non-paid mock
          state); "pending" → "Í bið", kept distinct because the real model
          has three states where the template's mock only has two. */}
      <section>
        <h2 className="m-0 mb-4 text-[19px] font-bold tracking-[-0.015em]">Útgreiðslusaga</h2>

        {!payouts || payouts.length === 0 ? (
          <EmptyState
            icon={<Calendar size={36} className="text-slate-400" />}
            title="Engar útborganir enn"
            description={`Þegar þú nærð lágmarksútborgun (${formatIsk(MIN_PAYOUT_ISK)}) verður stofnuð útborgun sem birtist hér.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th className="border-b border-outline-variant py-3.5 pr-4 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Tímabil
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Auðkenni
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Staða
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Brúttó
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Þóknun
                  </th>
                  <th className="border-b border-outline-variant py-3.5 pl-4 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Útborgun
                  </th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p, i) => {
                  const isLast = i === payouts.length - 1;
                  const statusVariant =
                    p.status === 'completed'
                      ? 'success'
                      : p.status === 'processing'
                        ? 'pending'
                        : 'pending';
                  const statusLabel =
                    p.status === 'completed'
                      ? 'Greitt'
                      : p.status === 'processing'
                        ? 'Í vinnslu'
                        : 'Í bið';

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors hover:bg-slate-50 ${isLast ? '' : 'border-b border-surface-container'}`}
                    >
                      <td className="py-[22px] pr-4 align-middle text-[15px] font-semibold text-slate-900">
                        {new Date(p.periodStart).toLocaleDateString('is-IS', {
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="max-w-[120px] truncate px-4 py-[22px] align-middle font-mono text-[13px] text-slate-400">
                        {p.id}
                      </td>
                      <td className="px-4 py-[22px] align-middle">
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                      </td>
                      <td className="px-4 py-[22px] text-right align-middle text-[15px] text-slate-600 tabular-nums">
                        {formatIsk(p.grossIsk)}
                      </td>
                      <td className="px-4 py-[22px] text-right align-middle text-[15px] text-slate-400 tabular-nums">
                        −{formatIsk(p.platformFeeIsk)}
                      </td>
                      <td className="py-[22px] pl-4 text-right align-middle text-[15px] font-bold text-slate-900 tabular-nums">
                        {formatIsk(p.netIsk)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Payout runs are per owner, not per site — the earnings totals
            above may be scoped to one site via the SiteSwitcher, but this
            history always covers every site, so that scoping is called out
            explicitly rather than left implicit. */}
        {siteId && (
          <p className="text-xs text-slate-400">
            Uppgjör eru alltaf fyrir alla vefi þína samanlagt.
          </p>
        )}
      </section>
    </div>
  );
}
