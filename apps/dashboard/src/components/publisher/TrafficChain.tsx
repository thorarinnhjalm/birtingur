import { Card } from '@/components/ui/Card';

/**
 * The publisher's traffic as the chain it actually is, rather than as four
 * unrelated stat cards.
 *
 * The old row showed Vefumferð, Birtingar and Fyllihlutfall side by side, drawn
 * from three different counters, and a publisher could not reconcile any two of
 * them. A site with three slots per page and 1.000 page views saw "Vefumferð
 * 1.000" next to "Birtingar 2.400" — correct, and indistinguishable from a bug —
 * and a fill rate whose denominator (3.000 ad requests) appeared nowhere on the
 * screen at all.
 *
 * Here every step is shown and each follows from the one before it, so the
 * percentages can be checked against numbers the reader can see.
 *
 * The two gaps are kept apart on purpose, because they call for opposite
 * responses:
 *
 *   requests -> filled     nobody bought this publisher's categories. Ours.
 *   filled   -> impressions the ad loaded but was never scrolled into view
 *                           (impressions are viewability-gated, see
 *                           packages/snippet/src/render.ts). The publisher's,
 *                           by moving the slot up the page.
 *
 * `unfilled` has only been measured since 2026-08-14, so it is absent for older
 * windows. When it is, the middle step renders as unmeasured and the component
 * falls back to the one honest ratio it can still compute — requests that
 * became a visible ad — rather than inventing a split it does not have.
 */

export interface TrafficChainProps {
  /** Real page loads. Absent before true traffic measurement began. */
  pageViewsTrue?: number;
  /** Ad requests — one per slot per page load. */
  requests: number;
  /** Ad requests that came back with no advertiser. Absent when unmeasured. */
  unfilled?: number;
  /** Ads that became visible. The figure the publisher is paid for. */
  impressions: number;
  /** Shown under the traffic step when no true figure exists yet. */
  measurementStartLabel: string;
}

const nf = (n: number) => n.toLocaleString('is-IS');

function Step({
  label,
  value,
  meaning,
  emphasis,
}: {
  label: string;
  value: string;
  meaning: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{label}</div>
      <div
        className={`text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${
          emphasis ? 'text-primary' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500">{meaning}</div>
    </div>
  );
}

function Link({ caption }: { caption: string }) {
  return (
    <div className="flex items-center gap-2 py-1 sm:flex-col sm:justify-center sm:py-0">
      <svg
        viewBox="0 0 40 8"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="h-2 w-6 shrink-0 rotate-90 text-slate-300 sm:w-full sm:rotate-0"
      >
        <path d="M0 4 H33" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M31 1 L38 4 L31 7 Z" fill="currentColor" />
      </svg>
      <div className="text-[11px] font-semibold whitespace-nowrap text-slate-500 tabular-nums">
        {caption}
      </div>
    </div>
  );
}

export function TrafficChain({
  pageViewsTrue,
  requests,
  unfilled,
  impressions,
  measurementStartLabel,
}: TrafficChainProps) {
  const splitKnown = unfilled !== undefined;
  const filled = splitKnown ? Math.max(0, requests - unfilled) : undefined;

  // Clamped at 100, matching how CTR is presented elsewhere on this page. An
  // impression pixel can fire in a later window than the request that produced
  // it (it waits for the ad to become viewable), so a boundary window can
  // legitimately hold more impressions than filled requests. "105% sáust" reads
  // as a bug; the honest ceiling is "all of them".
  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : null;

  const fillPct = filled !== undefined ? pct(filled, requests) : null;
  const viewPct = filled !== undefined ? pct(impressions, filled) : null;
  // The one ratio that survives without the split: requests that ended up as a
  // visible ad. Labelled for what it is rather than called a fill rate, which
  // it is not.
  const overallPct = pct(impressions, requests);

  return (
    <Card className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-x-2 gap-y-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-stretch">
        <Step
          label="Síðuflettingar"
          value={pageViewsTrue !== undefined ? nf(pageViewsTrue) : '—'}
          meaning={
            pageViewsTrue !== undefined
              ? 'Gestir sem hlóðu síðu'
              : `Nákvæm mæling hófst ${measurementStartLabel}`
          }
        />
        <Link
          caption={
            pageViewsTrue !== undefined && pageViewsTrue > 0
              ? `${(requests / pageViewsTrue).toFixed(1).replace('.', ',')} beiðnir á flettingu`
              : 'auglýsingapláss'
          }
        />
        <Step
          label="Auglýsingabeiðnir"
          value={nf(requests)}
          meaning="Pláss sem bað um auglýsingu"
        />
        <Link caption={fillPct !== null ? `${fillPct}% seldust` : 'ekki mælt'} />
        <Step
          label="Fylltar"
          value={filled !== undefined ? nf(filled) : '—'}
          meaning={
            filled !== undefined ? 'Auglýsandi fannst' : 'Skiptingin mælist frá 14. ágúst 2026'
          }
        />
        <Link caption={viewPct !== null ? `${viewPct}% sáust` : ''} />
        <Step
          label="Birtingar"
          value={nf(impressions)}
          meaning="Sáust á skjá — greitt fyrir þessar"
          emphasis
        />
      </div>

      {splitKnown ? (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
          {unfilled > 0 && (
            <p className="m-0">
              <strong className="font-semibold text-slate-900">{nf(unfilled)} beiðnir</strong> fengu
              enga auglýsingu, því engan auglýsanda var að hafa í þínum flokkum. Það er okkar að
              laga.
            </p>
          )}
          {filled !== undefined && filled - impressions > 0 && (
            <p className="m-0">
              <strong className="font-semibold text-slate-900">
                {nf(filled - impressions)} auglýsingar
              </strong>{' '}
              hlóðust en sáust aldrei. Þar hjálpar að færa plássið ofar á síðuna.
            </p>
          )}
          {unfilled === 0 && filled === impressions && (
            <p className="m-0">Allar beiðnir fengu auglýsingu og allar sáust.</p>
          )}
        </div>
      ) : (
        <div className="border-t border-slate-100 pt-4 text-sm text-slate-600">
          {overallPct !== null ? (
            <p className="m-0">
              <strong className="font-semibold text-slate-900">{overallPct}%</strong> af beiðnum
              urðu að sýnilegri auglýsingu. Frá 14. ágúst 2026 sést hvort það sem upp á vantar sé
              vegna þess að auglýsanda vantaði eða að plássið sást ekki.
            </p>
          ) : (
            <p className="m-0">Engar auglýsingabeiðnir á tímabilinu.</p>
          )}
        </div>
      )}
    </Card>
  );
}
