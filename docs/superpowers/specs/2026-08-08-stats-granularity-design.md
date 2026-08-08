# Stats granularity: per-creative-per-site for advertisers, site filter for publishers

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan

## Problem

Two reporting gaps, one per role:

1. **Advertisers** can see totals per publisher site on the campaign detail page
   ("Frammistaða eftir birtingavettvangi"), but not which creative performs on
   which site. With 1–5 creatives per campaign there is no way to tell whether
   a weak site is a targeting problem or a creative problem.
2. **Publishers** who own several sites (one publisher doc per domain, looked up
   via `getPublishersByOwnerEmail`) get one summed figure: `GET
   /v1/publishers/stats` aggregates across all their publisher ids before the
   dashboard ever sees the data. Firestore already stores per-site
   (`stats/publishers/{id}/{day}`) and per-slot
   (`stats/publisher_slots/{id}_{slotId}/{day}`) documents, so the granularity
   exists — it is thrown away at the API layer.

Both changes are additive. Neither touches the serving hot path
(`apps/serving`): `creativeId` already flows through `QueuedEvent` into the
stats aggregator.

They ship as **two independent branches/PRs** (per the oruggt-ship process):
Part A touches cron-written documents and needs the more careful review; Part B
is presentation plus one query parameter.

---

## Part A — Advertiser: per-creative breakdown within each site

### Data layer (`apps/api/src/services/stats-aggregator.ts`)

The aggregator already writes campaign-hour docs
(`stats/campaigns/{campaignId}/{YYYYMMDDHH}`) with a `byPublisher` map. Add a
sibling nested map, incremented in the same `FieldValue.increment` update:

```
byPublisherCreative: {
  [publisherId]: {
    [creativeId]: { impressions: number, clicks: number }
  }
}
```

Dot-path increments (`byPublisherCreative.pub_x.cre_y.impressions`) work
because both id families are generated slugs with no dots. Cardinality per
hourly doc is (sites serving that hour × creatives on the campaign), in
practice tens of entries — well within Firestore document limits.

Fallback/house-ad events (`campaignId === 'cmp_fallback'`, `cre_nocache`) are
excluded, mirroring the existing `byCampaign` exclusion.

### API layer (`apps/api/src/services/campaign-stats.ts`)

`getCampaignStats` already aggregates `byPublisher` across the selected window
and enriches with publisher `displayName` + `domain`. Extend each entry:

```
byPublisher[pubId] = {
  impressions, clicks, spendIsk, displayName, domain,   // unchanged
  byCreative: {
    [creativeId]: { impressions, clicks, name, thumbnailUrl }
  }
}
```

Creative metadata comes from one batched fetch of the campaign's creatives
(they are already loaded on this page's sibling endpoints; the service fetches
by id and tolerates deleted creatives by falling back to the id as name).
`spendIsk` stays at the publisher level only — spend is CPM-derived and
per-creative spend would just restate impressions.

### Honest numbers when history predates the field

Old hourly docs have `byPublisher` but no `byPublisherCreative`; raw events are
gone, so no backfill is possible. The per-creative sub-rows would silently sum
to less than the parent row. To keep the picture truthful, the service computes
the remainder per publisher:

```
unattributed = parent.impressions − Σ byCreative[*].impressions
```

and, when positive, returns it as a synthetic entry the UI renders as one muted
row: "Eldri gögn (fyrir sundurliðun)". As the campaign accrues new traffic this
row shrinks toward zero and disappears (entries with 0 impressions are
dropped).

### UI (`apps/dashboard/src/pages/advertiser/CampaignDetail.tsx`)

The existing table gains expandable rows — no new page, no new route, existing
TanStack Query hooks keep their shape (the response type in
`useCampaigns.ts` gets the optional `byCreative` field).

- Each publisher row gets a chevron; clicking toggles an inline group of
  creative sub-rows (indented, lighter background, thumbnail at ~32px, creative
  name, impressions, clicks, CTR — no eCPC/spend columns, cells left blank).
- Rows with exactly one creative and no unattributed remainder render without a
  chevron — expanding would only repeat the parent line.
- Sub-rows sort by impressions, matching the parent sort.
- Default state: all collapsed. Expansion state is component-local (resets on
  navigation — deliberate, keeps the table scannable).
- The existing empty state for the whole table is unchanged.

### Testing

- Emulator test on `aggregateEvents`: events for two publishers × two creatives
  produce the expected nested increments; fallback events excluded; a second
  batch increments rather than overwrites.
- Unit test on `getCampaignStats`: aggregation across hours, creative
  enrichment, deleted-creative fallback, and the unattributed-remainder row
  (old-style doc without the field).
- Dashboard: render test for expand/collapse and the single-creative no-chevron
  case.

---

## Part B — Publisher: site filter across the publisher dashboard

### API (`apps/api/src/routes/publishers.ts`, `services/publisher-stats.ts`)

`GET /v1/publishers/stats` gains an optional `?publisherId=` query param:

- Absent → current behaviour (aggregate across all the caller's sites),
  **plus** a new `bySite` array in the response (see below).
- Present → the id must be in `getPublishersByOwnerEmail(user.email)`;
  otherwise `403`. Valid → stats for that one site only (reuses the existing
  single-site read path `getPublisherStats`).

When aggregating (no filter) and the caller owns more than one site, the
response includes:

```
bySite: [{ publisherId, displayName, domain, impressions, clicks,
           pageviews, earningsIsk }]
```

This costs no extra reads — `getAggregatedPublisherStats` already fetches each
site's documents before summing; it just stops discarding the per-site
subtotals. Single-site callers get `bySite` omitted and see no UI change
anywhere.

### UI

**Site switcher.** A dropdown rendered in the publisher `AppShell` header, only
when the user owns >1 publisher (from the already-fetched `/v1/publishers/all`).
Options: "Allir vefir" (default) plus each site as "displayName — domain".
Selection is stored in the URL as `?site=<publisherId>` and preserved when
navigating between publisher pages, so a filtered view is linkable and survives
refresh. An invalid/foreign id in the URL falls back to "Allir vefir" silently.

Pages honoring the filter:

- **Dashboard.tsx** and **Earnings.tsx**: pass `publisherId` through to the
  stats query (`queryKey` includes it, so switching sites refetches cleanly).
- **SlotList.tsx**: client-side filter on the already-loaded slots by
  `publisherId` — no API change.
- Payouts list on Earnings stays unfiltered (payouts are per payout run, not
  per site) with a one-line note when a site filter is active.

**Per-site overview.** When "Allir vefir" is active and `bySite` has >1 entry,
Dashboard.tsx shows a compact table under the existing totals: one row per
site (name/domain, impressions, clicks, pageviews, earnings for the selected
timeframe), sorted by impressions, each row clickable → sets the site filter.
This is the "good picture at a glance" view; the switcher is the drill-down.

### Testing

- Route test: `?publisherId=` owned → single-site numbers; foreign → 403;
  absent → aggregate + `bySite` present only for multi-site owners.
- Dashboard: switcher renders only for multi-site users; URL round-trip;
  per-site table rows set the filter.

---

## Error handling

- Aggregator: the new increments ride in the existing per-doc update — a
  failure path is unchanged from today (the whole doc update retries on the
  next cron drain; events are only removed from the queue after a successful
  write).
- `403` on foreign `publisherId` uses the standard error envelope.
- Missing/partial `byPublisherCreative` data degrades to the unattributed row,
  never to wrong totals.

## Rollout

- Part A first requires nothing of Part B (and vice versa); order is free.
- Part A is additive to cron-written docs — old readers ignore the new field,
  new readers tolerate its absence. No migration.
- Both parts follow branch → PR → adversarial review → owner merges.
