# Extend Completed Campaign — Design

**Date:** 2026-08-01
**Status:** Approved by owner (design discussion in session; spec review pending)

## Problem

Campaigns become `completed` in exactly one way: the expiry sweep
(`sweepExpiredCampaigns`, runs in cron-refresh-cache) transitions any
fund-holding campaign whose `schedule.endsAt` has passed. This includes
campaigns with leftover budget (`budget.remainingIsk > 0`) — the leftover
hold is released back to the wallet's available balance.

Today there is no path back. The PATCH guard
(`services/campaigns.ts`, "Completed campaigns cannot be reactivated")
exists because a generic status flip would re-acquire a wallet hold
without passing the committed-funds reservation gate. The dashboard
additionally shows a broken "Ræsa herferð" button on completed campaigns
(`CampaignDetail.tsx` hides the toggle only for `pending_approval`),
which always produces a 400 with an untranslated English error — the bug
report that triggered this design.

Owners with leftover budget on an expired campaign should be able to
extend it: pick a new end date and let the remaining budget serve out.

## Scope (v1)

- **Date-only extension.** Reactivates a `completed` campaign with
  `remainingIsk > 0` by setting a new `endsAt` and re-reserving the
  leftover through the committed-funds gate. No budget changes in this
  flow — a campaign with zero remaining budget cannot be extended (the
  UI explains this instead of offering the action).
- **Dashboard-only.** Firebase ID tokens only, like approve/reject.
  `ak_` API keys are rejected; no MCP tool is added. Extension
  re-acquires a hold on wallet funds, so it follows the same rule as
  top-ups and budget increases: no programmatic path commits money.

Explicitly out of scope: extending with a simultaneous budget increase,
agent/MCP-driven extension, "duplicate campaign" flows.

## Service layer

New `extendCampaign(campaignId, advertiserId, newEndsAt)` in
`apps/api/src/services/campaigns.ts`:

1. Load campaign; verify ownership.
2. Require `status === 'completed'` (else 400), `remainingIsk > 0`
   (else 400 `NO_REMAINING_BUDGET`), `newEndsAt` in the future (else 400).
3. Inside the same Firestore transaction pattern as create/increase
   (serialized by a `fundsVersion` write on the advertiser doc):
   compute available = ledger balance − committed holds of the
   advertiser's OTHER fund-holding campaigns; require
   `available >= remainingIsk` (else 400 `INSUFFICIENT_FUNDS`).
   Then update `schedule.endsAt = newEndsAt`, `status = 'active'`.
4. The transition is validated through `CampaignSchema.parse` like
   `updateCampaignStatus` does, with a targeted field update (never a
   whole-doc set) so concurrent accrual writes to
   `budget.remainingIsk` cannot be clobbered.

The two existing PATCH/status guards stay untouched. Their documented
rationale is "no fund-holding flip without passing the gate"; this path
passes the gate, so the invariant holds by construction.

### Serving cache

Completion deleted `budget:{id}` and `pace_limit:{id}` from Redis, and
the budget gate is fail-closed (missing key = 0). After the transaction
commits, `extendCampaign`:

- seeds `budget:{id}` from `remainingIsk` (mirroring what
  cron-refresh-cache does), so serving resumes immediately instead of
  after up to 10 minutes;
- calls `pushCacheForCampaign(campaignId)` to restore slot mappings.

Redis being down does not fail the extension: the cron reseeds within
10 minutes, and the serving gate stays fail-closed in the meantime
(under-serving, never over-spending).

## Route

`POST /v1/campaigns/:id/extend` with body `{ endsAt: string (ISO) }` in
`apps/api/src/routes/campaigns.ts`. Auth: `requireAuth` + reject `ak_`
keys (same mechanism as approve/reject). Zod-validate the body; return
the updated campaign.

## Money integrity

- The ledger is never touched — no entry is created. Committed holds
  are a computed sum over fund-holding campaigns, so the `active` flip
  itself re-includes the leftover in the committed sum after the gate
  approved it.
- Agent monthly-cap accounting keys off `budget.totalIsk` of campaigns
  tagged `createdVia.apiKeyId`; extension does not change `totalIsk`,
  so cap math is unaffected.
- `cron-reconcile` needs no changes: ledger vs `remainingIsk` vs Redis
  counter relationships are preserved.
- `pendingReason` invariant is safe: a `completed` campaign never has
  `pendingReason`, and extension only produces `active`.

## Dashboard

`CampaignDetail.tsx`:

- For `completed` campaigns, the status-toggle button ("Ræsa herferð")
  is removed entirely — this also fixes the standing UI bug where it
  offered an action that always 400s.
- When `remainingIsk > 0`: a "Framlengja herferð" button opens a modal
  with a date picker (min: tomorrow) and the copy
  "Eftirstöðvar upp á X kr. verða frátaknar á ný." Confirm calls the
  extend endpoint and refreshes the campaign query.
- When `remainingIsk === 0`: no action button; a short explanation that
  the campaign spent its budget.
- Errors render in Icelandic, mapping `INSUFFICIENT_FUNDS` and
  `NO_REMAINING_BUDGET` codes; unknown errors get a generic Icelandic
  fallback (also covering the old untranslated guard text).

## Tests

Emulator tests (`apps/api/tests/`):

- Happy path: completed + leftover + sufficient available → 200,
  status `active`, `endsAt` updated, Redis `budget:{id}` seeded (when
  Redis configured in test env; otherwise assert the Firestore state).
- Insufficient available (another fund-holding campaign holds the
  wallet) → 400 `INSUFFICIENT_FUNDS`, campaign unchanged.
- `remainingIsk === 0` → 400 `NO_REMAINING_BUDGET`.
- Status not `completed` → 400.
- `ak_` key caller → 403.
- Concurrency: simultaneous extend + create that together oversubscribe
  the wallet — exactly one succeeds (fundsVersion serialization), using
  the existing oversubscription test pattern from commit ae2297b's
  suite.
- Existing PATCH-guard tests stay green (guards unchanged).
