# Publisher data presentation — implementation plan (2026-08-20)

Owner-approved redesign of how publisher data is presented, with **traffic
leading** the dashboard ("umferðin er eignin þín"), a new **Umferð** screen
meant to make Birtingur the place a publisher checks their traffic instead of
Google Analytics, and one vocabulary for every metric across chain, tables,
chart tabs and CSV.

Approved templates (final Icelandic copy, drawn against the real tokens in
`apps/dashboard/src/styles.css` and `editorial.tsx`):

- `docs/superpowers/specs/2026-08-20-utgefendagogn-templates/publisher-dashboard.dc.html`
- `docs/superpowers/specs/2026-08-20-utgefendagogn-templates/publisher-traffic.dc.html`
- `docs/superpowers/specs/2026-08-20-utgefendagogn-templates/publisher-dashboard-mobile.dc.html`

The numbers on the templates are **worked examples**, internally consistent
with `FLAT_CPM_ISK = 550`, 20% fee, 10.000 kr minimum payout. Implementations
compute from live data; every derivation rule is below.

Same convention as the 2026-07-03 Nordic redesign: **keep the existing
TanStack Query hooks/mutations/routes intact and only replace presentation**
— except where this plan explicitly adds API surface (PR 3, PR 4).

## Verified code facts this plan rests on (re-verify if `main` has moved)

1. `firePageviewOnce` (`packages/snippet/src/render.ts:74`) guards with a
   global flag: the pageview pixel fires **once per page load** regardless of
   slot count. `pageViewsTrue` is a real page-view figure, safe to lead with.
2. The aggregator writes `byBotClass` into publisher-day buckets
   (`apps/api/src/services/stats-aggregator.ts`), but
   `apps/api/src/services/publisher-stats.ts` **does not read it out** —
   the human/automated split on the Umferð screen requires the PR 3 API
   change. Nothing new needs to be _collected_.
3. `StatsResponse.history` rows carry `date`, `spendIsk`, `pageviews`
   (= slot loads / ad requests) **and** `pageViewsTrue?` per day — so
   "value per 1.000 readers" and its ceiling are computable client-side from
   already-fetched data, correctly paired (see derivations), with **no** API
   change.
4. `apps/api/src/services/slot-stats.ts` returns per-slot `unfilled` +
   `requestsWithFillData` but **no paired impression count** — naming the
   worst-viewability slot (PR 4) needs `impressionsWithFillData` added there.
   The per-slot-day Firestore docs already hold everything required.
5. The pageview event carries `country` (CF-IPCountry) all the way into
   `aggregateEvents`, which currently drops it. Cheapest possible win (PR 4).
6. `bot-class.ts` mandates: the known-bot list is deliberately incomplete and
   **nothing in the product may describe it as "bot filtering"**. All copy
   about the split must present it as a floor ("gólf, ekki heildartala").

## The vocabulary (PR 1, then used everywhere)

One word per concept, everywhere a publisher reads — chain, stat cards,
tables, chart tabs, CSV:

| Concept                                | Word                                                | Today's aliases (to be removed) |
| -------------------------------------- | --------------------------------------------------- | ------------------------------- |
| True page views (`pageViewsTrue`)      | **Síðuflettingar**                                  | Vefumferð (chart tab), —        |
| Slot loads / ad requests (`pageviews`) | **Auglýsingabeiðnir** (`Beiðnir` in narrow columns) | Hleðslur (CSV), Beiðnir         |
| Requests that got an advertiser        | **Fylltar**                                         | Fylling, Fyllihlutfall          |
| Viewable, billed impressions           | **Birtingar**                                       | —                               |
| Clicks                                 | **Smellir**                                         | —                               |

The fill _ratio_ is presented as `Fylltar` count with the percentage beside
it (`17.726 (61%)`), never as a bare percentage under a third name.

---

## PR 1 — Orðalag + tiltekt (no new data, lowest risk)

**Scope**: `apps/dashboard` only.

- `AnalyticsChart.tsx`: tab + series label `Vefumferð` → `Síðuflettingar`
  (both occurrences: `getMetricDetails` and the tab row).
- `Dashboard.tsx` CSV export: header `Hleðslur` → `Auglýsingabeiðnir`,
  `Fyllihlutfall` → `Fylltar`; keep the existing measured-days denominators
  and quoting exactly as they are (they were hard-won — see the comments in
  `downloadSlotsCsv`).
- Per-site and per-slot table headers unified to the table above.
- Remove the inert `Sía` button (it has no handler; confirmed in code and
  acknowledged by its own comment).
- One trend format everywhere: `↑ +12,0% frá fyrra tímabili` (the StatCard
  delta format). The hero card's bare `+12%` pill goes.
- `SlotDetail.tsx` also says `Hleðslur` (lines ~164, ~265) — rename there
  too; it is publisher-facing.
- Tests: update label assertions in `Dashboard.test.tsx` /
  `TrafficChain.test.tsx` **and `AnalyticsChart.test.tsx`** (the
  `Vefumferð` tab assertions live there, lines ~41/49); add a test pinning
  the CSV header row verbatim so the vocabulary cannot silently drift again.

**Definition of done**: grep for `Vefumferð` and `Hleðslur` in
`apps/dashboard/src/pages/publisher` and
`apps/dashboard/src/components` returns nothing. The admin page
(`pages/admin/Overview.tsx` says `Vefumferð (síðuskoðanir)`) is **out of
scope** — admin copy was not part of this design pass; leave it.

## PR 2 — Mælaborðið endurskipulagt (presentation only)

**Scope**: `apps/dashboard/src/pages/publisher/Dashboard.tsx` (+ small
shared pieces). Template: `publisher-dashboard.dc.html`; mobile behavior:
`publisher-dashboard-mobile.dc.html`. Same queries, same endpoints.

Five sections built with `NumberedSection` from
`src/components/ui/editorial.tsx` (already exists, currently unused on this
page):

**01 Lesendurnir þínir** (traffic leads — owner's explicit call)

- Big figure: `pageViewsTrue` for the window; trend delta computed with the
  equal-halves rule already in `pctChanges` (extend the memo to sum
  `pageViewsTrue` over measured days only).
- **Virði hverra 1.000 lesenda**: computed from `stats.history`, summing
  `spendIsk` and `pageViewsTrue` over **only the days where
  `pageViewsTrue !== undefined`** — never whole-window revenue over
  measured-days traffic (that is exactly the class of denominator mismatch
  `TrafficChainProps` documents). Formula:
  `round(publisherNetIsk(Σ spendIsk_measuredDays) / Σ pageViewsTrue × 1000)`.
- **Þak eins og staðan er** (ceiling): requests-per-pageview over the same
  measured days × net CPM:
  `round((Σ pageviews_measuredDays / Σ pageViewsTrue) × publisherNetIsk(FLAT_CPM_ISK))`.
  Progress bar = value / ceiling.
- Mini daily sparkline of `pageViewsTrue` (gaps for absent days, same
  contract as `AnalyticsChart`), caption with human-traffic share **only
  after PR 3 lands** (the field doesn't exist yet — render the caption
  without it until then), link `Sjá alla umferð →` to `/publisher/traffic`
  (renders only once PR 3 lands; before that, omit).
- Unmeasured state: a window with no `pageViewsTrue` at all renders em-dash
  figures and `Nákvæm mæling hófst {formatDate(TRAFFIC_MEASUREMENT_START)}`
  — absence is shown honestly, never a fabricated 0 (house rule).

**02 Tekjurnar þínar**

- The existing hero pair (rolling revenue card + dark `Bíður útgreiðslu`
  card) kept as-is with its queries, plus the one linking sentence from the
  template. The four-card StatCard row is **deleted**: revenue appeared 3×
  on this page, next-payout 2×, impressions 2×. `Næsta útgreiðsla` lives
  only inside the dark card; `Meðal eCPM` is replaced by 03's arithmetic.

**03 Hvaðan tekjurnar koma**

- `TrafficChain` unchanged (it is the best thing on the page).
- New footer rows inside the same Card:
  - the arithmetic line `X birtingar × 440 kr á hverjar 1.000 = Y kr`
    (compute `Y` as `publisherNetIsk(spendIsk)` and present 440 as
    `publisherNetIsk(FLAT_CPM_ISK)` — never hardcode either number), with
    the sentence explaining 550 kr gross / 80% share;
  - the clicks line (`Smellir hafa ekki áhrif á tekjur þínar — greitt er
fyrir birtingar, ekki smelli`), CTR clamped at 100 as everywhere.
- The orphan `Smellir`/`Smellihlutfall` StatCard pair is deleted.

**04 Það sem vantar upp á**

- Two cards from data the chain already receives: `unfilled` → „Okkar mál";
  `filled − impressionsWithFillData` → „Þitt mál" (with the kr value of the
  unseen gap: `publisherNetIsk(round(gap / 1000 × FLAT_CPM_ISK))`).
- Per-1.000-síðuflettingar costs on each card **only when both the fill
  split and true traffic are measured for the window**; otherwise omit that
  line rather than mixing windows. When the split is unmeasured entirely,
  the section renders the single honest ratio + measurement-start note,
  mirroring `TrafficChain`'s fallback branch.
- Naming the worst slot on the „Þitt mál" card is PR 4 — leave it out here.

**05 Sundurliðun**

- Per-site table, chart card, per-slot table — content unchanged, headers
  from the PR 1 vocabulary, `Fylltar` as count + `(x%)`, CSV button moved
  beside the per-slot table.
- **Mobile (< md)**: tables render as stacked card rows (name + revenue
  headline, 3-column mini-grid of Beiðnir/Fylltar/Birtingar) per the mobile
  template — a seven-column table at 390px is unreadable and publishers
  check earnings on phones. Implement as a breakpoint-switched render in the
  same component; keep row-click filtering behavior.

- Tests: paired-derivation unit tests (a window mixing measured and
  unmeasured days must exclude unmeasured-day revenue from value-per-1000 —
  seed history with both kinds and assert), absent-not-zero rendering for
  01, deletion of duplicate cards asserted by absence of `Meðal eCPM`.

## PR 3 — API: bot-class rollup + Umferð screen

**Scope**: `apps/api` + `apps/dashboard`. Template:
`publisher-traffic.dc.html`.

API (`services/publisher-stats.ts` + the `/v1/publishers/stats` route):

- Read `byBotClass` out of the publisher-day docs it already fetches and add
  to `PublisherStatsResponse`:
  `botClass?: { human?: number; knownBot?: number; suspectedBot?: number }`
  (page views only, absent — never 0 — when no day in the window carries the
  field; unclassified remainder stays implicit as
  `pageViewsTrue − Σ classes`, per the aggregator's own contract).
  Add the same optional rollup per `bySite` row.
- **Stored-shape mapping (trap)**: the Firestore field is `byBotClass`,
  keyed by the raw event strings `'human' | 'known_bot' | 'suspected_bot'`
  (`apps/serving/src/lib/bot-class.ts`), and each class holds an **object**
  `{ impressions?, pageViewsTrue? }` — the rollup reads the `pageViewsTrue`
  sub-field and maps snake_case keys to the camelCase response names. A
  naive `doc.byBotClass.knownBot` read is permanently `undefined` and,
  under absent-not-zero semantics, renders as "unmeasured" forever with no
  error. Pin the mapping in a test.
- **Per-site pairing for the Umferð table**: `SiteBreakdown` today carries
  whole-window `spendIsk` and measured-days `pageViewsTrue` — dividing them
  is the forbidden denominator mismatch, and there is no per-site history
  to compute a per-site trend from. So: while the service loops each site's
  day docs, additionally accumulate per-site
  `spendIskWithTrafficData?` + `requestsWithTrafficData?` (sums over only
  the days carrying `pageViewsTrue`, same discipline as
  `requestsWithFillData`). The template's per-site `Tekjur á 1.000` column
  computes from that pair; a per-site **trend** column was cut from the
  template for exactly this reason — do not re-add it without per-site
  history. Note `bySite` is only populated for multi-site owners: the
  single-site case renders the section from the top-level totals instead.
- Emulator tests in `apps/api/tests/`: seed stats docs with and without
  `byBotClass` (raw snake_case keys, object values), assert rollup sums,
  absence semantics, the snake→camel mapping, the per-site variant, and the
  per-site paired sums excluding unmeasured days. Run via `pnpm test:api`.

Dashboard:

- New route `/publisher/traffic`, sidebar item `Umferð` (icon
  `monitoring`) between Mælaborð and Vefir in `sidebarItems`
  (`Dashboard.tsx:923`).
- Page per template, reusing the **same** `['publisher','stats', timeframe,
siteId]` query (no new fetch): 01 Lesendur (large daily chart with
  meðaltal/besti dagur, human/automated split cards), 02 Eftir vefjum,
  03 Hvað umferðin skilar (value per 1.000 + link back to dashboard),
  04 Hvað þessi tala nær ekki yfir.
- **Copy constraints (load-bearing):**
  - The split is a floor: „Listinn yfir þekkta skriðla er ekki tæmandi —
    þetta er gólf, ekki heildartala." Never the words "bot filtering"
    (mandated in `bot-class.ts`).
  - **The split has no billing effect today** — `accrual.ts` never reads
    bot class (class-based billing is an explicit future "Phase 2" in
    `bot-class.ts`). Copy must never imply humans are "what you get paid
    for"; payment is per viewable impression. The template's human-traffic
    card says exactly this („Flokkunin breytir ekki uppgjöri — greitt er
    fyrir sýnilegar birtingar, ekki flettingar") — a review caught an
    earlier draft claiming the opposite; do not reintroduce it.
  - Section 04's honesty card ships verbatim: we only count pages that
    carry a Birtingur slot, so the number is „gólf á umferðinni þinni, ekki
    heildartala" and will read lower than whole-site analytics. Shipping
    the screen **without** this card is worse than not shipping it: the
    first Analytics comparison would burn trust in every other number.
- Hook up the 01-section caption + `Sjá alla umferð →` link left dormant in
  PR 2.

## PR 4 (optional, after 1–3) — Ódýrir sigrar

- **Lönd**: `aggregateEvents` currently drops `ev.country`. Add
  `byCountry?: Record<string, number>` (true page views only) to the
  publisher-day bucket — bounded cardinality, ISO codes. Test in the stats
  drain suite. Display on Umferð in a follow-up once data accumulates.
- **Per-slot viewability**: add `impressionsWithFillData` pairing to
  `slot-stats.ts` (same pairing discipline as `requestsWithFillData`), then
  the „Þitt mál" card names the worst slot: „X af því er {slot name}". Test
  the pairing against mixed measured/unmeasured slot-day docs.

## Cross-cutting (every PR)

- Branch/PR flow per repo convention; before forming conclusions **re-run
  the freshness check** (`git fetch origin main && git log --oneline
HEAD..origin/main`) — parallel agents ship here daily.
- `pnpm verify` + the touched package's tests before push; api tests via the
  emulator wrappers only.
- **Independent subagent review of the diff before every push**
  (oruggt-ship step 4) — report its findings to the owner, including
  "nothing".
- Update `docs/superpowers/specs/2026-08-12-blueprint.md` in the same PR
  that changes behavior it describes (PR 3 and PR 4 touch the stats
  contract).
- Styling: theme tokens and editorial primitives only (`bg-primary`,
  `bg-surface-*`, `rounded-card`, `NumberedSection`, `BigFigure`) — the
  templates' hex values are the _resolved_ values of those tokens, not an
  invitation to hardcode.
- No prerender re-capture needed: `/publisher/*` routes are authed app
  routes, not in `public/sitemap.xml`.
- Marketing-claims guardrail applies to all new copy (no claims beyond the
  verified USP list).

## Explicitly out of scope (decided during design)

- **Unique visitors / sessions**: `visitorToken` is consent-gated and empty
  without consent; cookie-free is the marketing promise. Do not promise or
  approximate this.
- **Traffic on pages without a Birtingur slot**: structurally invisible;
  handled by honesty copy, not by collection.
- **Per-slot pageview attribution**: the pageview event is tagged with
  whichever slot fired first — it would look like data but be an accident.
  Rejected during design; do not resurrect.
- Top pages / referrers / devices: would require `widget.js` changes (URL +
  referrer are not sent today). Needs its own design pass first.
