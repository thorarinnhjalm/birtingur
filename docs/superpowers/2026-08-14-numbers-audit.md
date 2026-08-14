# Audit: every number a publisher or advertiser sees

Written 2026-08-14. **This is a decision document, not a record of work done.**
Nothing here is fixed. Each item needs the owner's call on whether it ships, and
each accepted item ships with a test — per `CLAUDE.md`, a finding that lives only
in a memo is a finding that gets rediscovered.

## Scope and method

Every number rendered to a publisher or an advertiser: the dashboard pages, the
CSV export, the two embeddable widgets, and the MCP tools. Traced from the pixel
that produced the event, through `stats-aggregator.ts`, through the per-role
stats services, to the label on screen.

Two independent audits ran the surfaces; **every item marked VERIFIED below was
then read in the source by the author of this document.** Items marked REPORTED
came from an audit and are plausible but have not been independently confirmed —
treat their numbers as indicative, not settled.

Priorities are about **money and trust**, not effort:

- **P1** — the number is wrong today and someone acts on it (pays, bills, buys,
  or blames themselves for it).
- **P2** — the number is wrong or contradicts another surface, but the harm is
  confusion rather than a decision.
- **P3** — the label lies about a number that is itself correct, or the figure is
  correct but fragile.

Cost estimates are for the fix **plus** the test that pins it.

---

## P1 — wrong today, and acted on

### 1. Fill rate mixes two different time windows, so it reads ~98% where it should read ~50% (VERIFIED)

`publisher-stats.ts:170-182` sums `pageviews` over **every** day in the window
but `unfilled` only over days that measured it. `unfilled` started on
2026-08-14, so a 30-day window today divides 30 days of ad requests by 1 day of
unfilled.

A site with a genuine 50% fill rate, 1.000 requests a day: `requests = 30.000`,
`unfilled = 500` → **98% seldust**, rendered green (the threshold is 70% at
`Dashboard.tsx:622`).

It gets worse than a wrong number. `TrafficChain.tsx:179-187` then reads the
leftover as "hlóðust en töldust aldrei sýnilegar — oftast þýðir það að plássið er
neðarlega á síðunni", so the publisher is told that our unsold inventory is their
placement problem. That is the exact confusion the chain was built to remove.

Self-corrects around 2026-09-13, when the window is fully measured. Until then it
is wrong every day.

Fix: clamp the fill window to measured days only, or return fill as a rate
computed per day and averaged. Also shows in the per-site table
(`Dashboard.tsx:568-570`) and on `SlotDetail.tsx:226-227`.

**Cost: ~2h.** Same shape applies to `pageViewsTrue` (item 12).

### 2. The serve-time budget gate counts 1 ISK per impression instead of 0,55 (VERIFIED)

`apps/serving/src/routes/impression.ts:179` — `costIsk = Math.round(FLAT_CPM_ISK / 1000)`,
and `Math.round(0.55) = 1`. That number drives both `decrementBudget` and
`incrementPaceSpent`.

The budget gate self-heals: `budget:{id}` is reseeded from `remainingIsk` every
10 minutes and accrual only ever booked the real ~0,55, so the campaign is not
permanently overcharged. **Pacing does not self-heal within the day.**
`pace_limit` is seeded in real ISK (`push-cache.ts:331`, `remainingIsk / daysLeft`)
and enforced against a counter ticking 1 per impression, so each day allows
roughly 55% of the impressions it was meant to. The shortfall is pushed to the
end of the flight, where `daysLeft` is small — a long-tail network cannot absorb
a final day sized ~3,8x the first.

The constant dates from an assumed 1.000 kr CPM; `FLAT_CPM_ISK` has only ever
been 550 in this repo. `apps/serving/tests/click-impression.test.ts:318` pins the
wrong value as correct, with the comment `// 1000 CPM / 1000 = 1 ISK`.

Fix: decrement in the same unit accrual books, or track impressions and convert.
Note this is a serving-side cache/counter semantic — **deploy reader before
writer** if the counter unit changes.

**Cost: ~3h**, most of it in re-reasoning the pacing tests.

### 3. Buy-flow inventory double-counts any publisher in more than one category (VERIFIED)

`inventory.ts:64-67` adds each publisher's daily average to **every** category
they declare, and `CampaignCreate.tsx:273-276` then **sums** across the selected
categories.

One publisher doing 1.000 impressions/day in `matur` and `lifsstill`: selecting
both shows **~2.000 birtingar á dag** against a true capacity of 1.000. The
oversell warning below it uses the same inflated figure, so it stays silent for
any campaign needing up to 2.000/day.

The same numbers go to agents through MCP `list_categories`, whose description
tells the agent to size the budget from them.

Fix: deduplicate publishers across the selected categories before summing, which
means the sum has to happen server-side, not in the component.

**Cost: ~4h.** Advertisers buy on this number.

### 4. Dashboard revenue and the ledger disagree, most for the smallest publishers (VERIFIED as a mechanism; the worked figures are REPORTED)

Two roundings of the same money at different granularity:

- `stats-aggregator.ts:482` adds `round(impressions / 1000 * 550)` **once per
  hourly aggregation run**. One impression in an hour becomes `round(0,55) = 1` kr.
- `accrual.ts:251` computes the same expression per publisher per campaign per
  15-minute run, but defers anything under 3 ISK (`MIN_SPLITTABLE_GROSS_ISK`)
  until it accumulates.

A blog with one impression an hour for 30 days (720 impressions) is owed 317 kr
net. The dashboard's "Áætlaðar tekjur" derives 576 kr from `spendIsk`. The
Earnings page's ledger-backed figure lands near 288 kr. Same publisher, same
week, two pages of the same app.

The mechanism is confirmed in the source. The three figures above come from the
audit and were not independently recomputed — **verify them before quoting them
to anyone**. The author's own simulation of a larger publisher put the gap nearer
1-2% than 2x, so the size is strongly dependent on traffic shape.

Also visible within one page: `SlotDetail.tsx:206` derives the card from
`spendIsk` while the table below it (`slot-stats.ts:218`) derives from the
impression count. **The table is the more correct of the two.**

Fix: make `spendIsk` a derived figure everywhere (`impressions / 1000 * 550`,
rounded once at read time) rather than an accumulated one, and add a test that
ties a stats-derived total to the ledger. Nothing today pins the two together.

**Cost: ~6h**, and it needs a decision: is the displayed figure meant to predict
the payout, or to describe the traffic? They cannot both round the same way.

### 5. The top-up invoice does not balance and describes a transaction that did not happen (VERIFIED)

`TopUp.tsx:74-80` splits every top-up as `deposit = round(x × 0,8)`,
`fee = round(x × 0,2)`, `vat = round(fee × 0,24)`. For 100.000 kr the printed
document shows line items 80.000 and 20.000, VAT 4.800, and "Greidd
heildarupphæð 100.000". Those do not add up: 80.000 + 20.000 + 4.800 = 104.800.
Read the other way, a VAT-inclusive fee of 20.000 implies VAT of 3.871, so the
declared 4.800 is 24% too high against the document's own total.

The ledger credits the **full** 100.000 (`wallet.ts:184-189`); the 20% is carved
out of the publisher's gross at accrual, never from the deposit. So the invoice
describes a fee split that does not occur.

The page is headed "Löglegur VSK-reikningur fylgir hverri áfyllingu". This is a
**different surface** from the campaign-confirm VSK line already decided for
removal.

**Cost: ~3h for the arithmetic.** The accounting question — what the receipt
should say — is the accountant's, and is already queued behind the same open
question as the confirm-screen line.

---

## P2 — contradicts another surface

### 6. The publisher stats widget shows gross where the dashboard shows net (VERIFIED)

`packages/widgets/src/components/stats.ts:290` renders `spendIsk` unmodified
under "Áætlaðar tekjur", and eCPM from the same gross figure at `:294`. The
dashboard shows both net of the 20% fee.

10.000 impressions: dashboard **4.400 kr / 440 kr eCPM**, widget **5.500 kr /
550 kr eCPM**. A 25% overstatement, on a page the publisher embeds publicly on
their own site.

**Cost: ~1h.**

### 7. MCP `check_slot_delivery` calls a gross figure `earningsIsk` (REPORTED)

`slot-delivery.ts:267`. Same defect as item 6, in the surface an agent reads and
relays. **Cost: ~30min**, bundle with 6.

### 8. MCP `get_stats` ignores the period it is asked for (VERIFIED)

`apps/mcp/src/tools/publisher/get-stats.ts:16` sends `?period=30d`;
`routes/publishers.ts:152` reads `timeframe`. The parameter is dropped and the
window silently falls back to 7 days. `period: '7d'` and `period: '30d'` return
identical numbers, and the tool description promises "fyrir valið tímabil".

**Cost: ~30min.**

### 9. One campaign's spend is computed four different ways (REPORTED)

`campaign-stats.ts:233` (once over the window), `campaign-stats.ts:145` (stored
per-run values summed), `advertiser-stats.ts:125` (recomputed per campaign-hour),
and `accrual.ts:251` (the actual charge). The audit's worked example put the
per-publisher table ~9% above the eCPM card's basis for the same campaign.

Same root cause as item 4. Fixing 4 properly should collapse most of this.

**Cost: folded into item 4.**

### 10. The creative performance table is neither campaign-scoped nor on the page's date range (REPORTED)

`CampaignDetail.tsx:637-664` reads `/v1/creatives/stats?hours=168`, and creative
stats carry no campaign dimension (`stats-aggregator.ts:342-347`). A creative
used in two campaigns shows the sum of both, on a fixed 7-day window, while the
publisher-performance table on the same screen is campaign-scoped. Two
contradictory numbers for one creative on one page.

**Cost: ~4h** — needs a campaign dimension on creative stats, which is a write
-path change.

### 11. Slot tables ignore the 7/30-day toggle (VERIFIED)

`routes/slots.ts:74` hardcodes `getSlotStats(..., 30)`. The cards and chart at
the top of the publisher dashboard follow the toggle; the "Virkar
auglýsingastöður" table below, `SlotList.tsx`, and the CSV do not. Select
"7 dagar" and the page shows 7.000 impressions above and 30.000 in the table.

**Cost: ~2h.**

### 12. Requests-per-page-view is ~5x too high, same window bug as item 1 (VERIFIED as the same mechanism)

`pageViewsTrue` is absent before 2026-08-09 while `pageviews` counts the whole
window. `TrafficChain.tsx:143` divides one by the other. Self-corrects
2026-09-08. Fixing item 1 fixes this.

**Cost: included in item 1.**

### 13. "Kerfisbirtingar" counts ad requests, not impressions (VERIFIED)

`advertiser-stats.ts:44` — `total += data.pageviews || data.impressions || 0`,
and on publisher-day docs `pageviews` is the slot-load counter. A network taking
10.000 requests a day at 40% fill records ~2.800 impressions and displays 10k,
under a live "Í gangi" pulse an advertiser reads as network scale.

**Cost: ~1h.**

### 14. The campaign-detail cost chart is always a flat zero (REPORTED)

`getCampaignStats` returns `{hour, impressions, clicks}` with no `spendIsk`
(`campaign-stats.ts:132-136`), but the chart's "Kostnaður" tab plots
`d.spendIsk || 0`. The per-hour figure exists in Firestore and is simply not
returned. **Cost: ~1h.**

---

## P3 — the label lies, or the number is fragile

### 15. "+33,3% frá fyrra tímabili" on flat traffic (VERIFIED)

Both dashboards split history at `floor(length / 2)`, so the 7-day preset
compares 3 days against 4. Perfectly flat traffic reads +33,3%. The 30-day
preset splits evenly and is fine. Publisher: `Dashboard.tsx:107-123`.
Advertiser: `Dashboard.tsx:181-183`, which also feeds the eCPC/eCPM badges.

**Cost: ~1h.**

### 16. "Áætluð birting á dag" always assumes 30 days (VERIFIED)

`CampaignCreate.tsx:255` divides by a hardcoded 30 while the oversell warning
directly below uses the real flight length (`:284`). A 7-day, 20.000 kr campaign
shows "1.212 birtingar á dag" above a warning that says it needs 5.195 —
4,3x apart, same screen. **Cost: ~30min.**

### 17. "í þessum mánuði" is a rolling window (VERIFIED for the publisher page)

Publisher `Dashboard.tsx:378` labels the selected timeframe's sum "Áætlaðar
tekjur í þessum mánuði" — on the 7-day setting that is a week. Advertiser
`Dashboard.tsx:467` says "Eytt í mánuðinum" over whatever range is selected,
including 90 days. **Cost: ~1h**, mostly deciding the wording.

### 18. "Næsta útgreiðsla" means two different things (REPORTED)

Publisher `Dashboard.tsx:452-462` shows 30-day revenue under that heading; the
Earnings page shows the real unpaid basis, **zeroed below the payout minimum**. A
new publisher with 4.000 kr sees "Næsta útgreiðsla: 4.000 kr" on one page and
"Beðið eftir útgreiðslu: 0 kr" on the other. The dashboard figure is the one that
promises money and the one that is wrong. The same label is also used on a card
whose value is a date. **Cost: ~2h.**

### 19. The CSV fill column can never populate — and the test that covers it pins a fiction (VERIFIED)

`routes/slots.ts:77-83` builds the slot `stats` object from four fields and drops
`unfilled`, though `getSlotStats` returns it (`slot-stats.ts:248`). So
`Dashboard.tsx:183` always sees `undefined` and the column always says "ekki
mælt", including after 2026-08-14.

**The test added in PR #51 fixtures `unfilled` into a response the API never
produces**, then asserts the resulting percentages. It is green and it proves
nothing. This is the author's own regression from yesterday and it is exactly the
failure mode this repo keeps hitting: a test that describes an intention rather
than the system.

Fix: pass `unfilled` through in `routes/slots.ts` and re-point the test at a
fixture the route can actually emit. **Cost: ~1h.**

### 20. Smaller, verified, cheap

- `0.8` hardcoded instead of `DEFAULT_PLATFORM_FEE_PERCENT` in five places
  (`Dashboard.tsx:202`, `SlotDetail.tsx:206` and `:291`, `AnalyticsChart.tsx:64`,
  `slot-stats.ts:218`). Correct today, silently wrong if the fee ever moves.
- `formatIsk` emits "0 kr" while several literals say "0 kr." — same number, two
  renderings, often in the same row.
- `SlotCreate.tsx:162` tells the publisher "550 kr. fyrir hverjar 1.000
  sýningar" on their own slot-creation page. That is the advertiser's price; the
  publisher gets 440.
- `advertiser-stats.ts:135-171` fabricates random impressions and spend whenever
  `FIRESTORE_EMULATOR_HOST` is set or `NODE_ENV === 'development'`. Production is
  unaffected, but any environment tripping either condition shows an advertiser
  invented money.
- Today's bucket is always partial (the window ends on today), so the last point
  of every chart dips. Hourly aggregation also means everything lags up to an
  hour, and a degraded `cron-aggregate` run lags further with no signal to the
  publisher.

**Cost: ~3h for the lot.**

---

## Checked and found correct

Worth recording so the next audit does not re-tread it:

- **CTR is now consistent on all sixteen surfaces** that render it, clamped at
  100 with a guarded denominator.
- **House ads do not inflate publisher revenue.** `impression.ts:49-53` routes
  fallback creatives into the pageview branch, so they never become impression
  events. Fallback clicks are excluded separately at `stats-aggregator.ts:361`.
  (The author checked this specifically, expecting a bug, and found none.)
- **The net formula itself is right.** `round(g × 0,8)` in the UI and
  `g − round(g × 0,2)` in `wallet.ts` agree for every integer gross.
- **The absent-not-zero contract holds end to end** for `unfilled` and
  `pageViewsTrue`, from aggregator to UI dash, and is tested.
- **Fill is `(requests − unfilled) / requests` everywhere**, never
  `impressions / requests`. The definition is consistent; item 1 is about the
  inputs, not the formula.
- **Division by zero is guarded** on every surface read.
- **Wallet balance, committed and available funds** are one server-side
  computation shown identically on four surfaces and well tested.
- **The payout table reconciles** — gross, fee and net always sum.
- **The campaign confirm screen carries no VSK figure** and totals exactly what
  the server debits.
- **Hour and day keys are UTC throughout**, and Iceland is UTC year-round, so
  there is no date-boundary drift.

---

## Suggested order

1. **Item 2** (pacing counter) — the only item silently changing what advertisers
   get delivered right now.
2. **Items 1 + 12** (the window bug) — wrong every day for the next month, and it
   blames publishers for our own unsold inventory.
3. **Item 3** (inventory double-count) — advertisers size budgets on it.
4. **Items 6 + 7 + 19** (gross-vs-net and the dead CSV column) — a few hours
   together, and 19 removes a test that is currently lying.
5. **Item 4** (revenue vs ledger) — needs a decision before it needs code.
6. **Item 5** (the receipt) — needs the accountant, already queued.

Everything below that is cosmetic until the five above are settled.
