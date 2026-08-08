# Payout integrity: cumulative carry-forward, 10.000 kr minimum, VAT hold, publisher reconciliation, accrual hardening

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan

## Problem

The 2026-08-05 whole-system audit (`docs/superpowers/system-audit-2026-08-05.md`)
left the money-exit side of the platform with verified defects:

1. **Sub-minimum earnings are silently dropped** (audit #2). `cron-payouts`
   queries `publisher_credit` strictly within the previous calendar month and
   skips publishers under the minimum; no later run revisits the period, so
   the skipped credits never become payable — contrary to the code's own
   comment ("below this rolls into next month") and the public FAQ promise.
   The target market (long-tail creators earning 2–4.000 kr/month) can
   currently never be paid at all.
2. **VAT is disbursed but never collected** (audit #3). Payouts add `vatIsk`
   on top of net for VAT-registered publishers while nothing on the
   advertiser side collects it; every such payout drifts the publisher's
   ledger negative with no reconciliation check to notice.
3. **Reconciliation has no publisher-side coverage** (audit #5) — which is
   why both of the above could persist silently.
4. **Accrual has a hard throughput ceiling and a lossy drain** (audit #4):
   one 500-event batch per 15-minute run (~48k impressions/day ceiling), and
   `rpop` with no re-queue means a mid-batch crash destroys billing events.

Owner decisions taken during brainstorming (2026-08-08):

- **Minimum payout rises to 10.000 kr** (from 5.000). Acceptable together
  with carry-forward because nothing is ever lost anymore — it only accrues
  longer before first disbursement. All public copy must move in lockstep.
- **Backlog review before settlement:** the owner sees the computed payout
  list before any historical backlog is disbursed. Satisfied structurally:
  the cron only _creates_ payout docs; disbursement remains the owner's
  manual bank transfer + mark-complete. Payout docs additionally break out
  current-period vs carried-forward amounts so the first post-fix run is
  reviewable at a glance.
- **VAT disbursement on hold** pending the accountant's answer (same
  conversation as the advertiser-side VSK question on the campaign confirm
  screen — backlog item 9 in memory). `vatIsk` keeps being computed and
  stored as a reported field; it is excluded from the disbursed amount until
  the tax model is settled.

## Part 1 — Cumulative payout basis (ships with Part 2)

`services/payouts.ts` changes:

- **Basis:** for each publisher, payable = Σ`publisher_credit` with
  `createdAt ≤ periodEnd` − Σ `netIsk` over ALL that publisher's prior
  payout **docs** (every status — pending, processing, completed). Docs,
  not ledger entries: the ledger `payout` entry only lands when the owner
  marks the transfer complete (`markPayoutCompleted`), so subtracting
  ledger entries would double-count credits sitting behind a created-but-
  not-yet-transferred payout on the next run. Pay when payable ≥
  `MIN_PAYOUT_ISK`. The period window is no longer the query filter — it
  only names the run.
- **Idempotency:** payout docs get the deterministic id
  `pay_{publisherId}_{YYYYMM}` written with `.create()`; a re-run after a
  partial failure hits ALREADY_EXISTS and skips instead of double-paying.
  The ledger entry stays where it is today — appended at
  `markPayoutCompleted`, when money actually moves.
- **Review breakdown:** each payout doc carries `currentPeriodIsk` (credits
  dated inside the run's month) and `carriedForwardIsk` (the rest), summing
  to the gross basis. The admin payout list surfaces both columns.
- **VAT hold:** `vatIsk` is still computed and stored on the doc, but the
  disbursed amount and the ledger entry are net-only. A single constant
  (`DISBURSE_VAT = false` in `payouts.ts`, with a comment pointing at the
  accountant decision) marks the flip point.
- **Minimum:** `MIN_PAYOUT_ISK` in `packages/shared/src/constants.ts`
  changes 5000 → 10000. Code that reads the constant (Earnings page,
  payout service) follows automatically.

### Copy sweep for the new minimum

Hardcoded "5.000 kr." payout-minimum mentions (NOT unrelated 5.000-kr
figures — each match is judged in context) move to 10.000 kr. in:
`FaqPage.tsx`, `TermsPage.tsx`, `PublisherLanding.tsx`, `AppShell.tsx`
(FAQ answers), `EnglishGuidePage.tsx`, `EnglishCategoryPage.tsx`, and any
`locales/` strings. Marketing routes are prerendered: after the copy change,
`pnpm --filter @ada/dashboard build` then `prerender:capture` and the
committed `snapshots.json` must be refreshed (CLAUDE.md mandate), or
crawlers keep the old promise. English pages follow the write-en-guide
conventions. Optional courtesy (owner's call, not in scope): notify the
few existing publishers of the raised minimum.

## Part 2 — Publisher-side reconciliation (ships with Part 1)

`services/reconciliation.ts` gains two read-only checks, alerting through
the existing `ops-alerts` path like the current campaign-side checks:

- **Balance conservation per publisher:** Σ`publisher_credit` −
  Σ|`payout` entries| must be ≥ 0 and equal to the publisher's computed
  unpaid balance; any negative balance (the VAT-drift signature) alerts.
- **Stuck-payable detection:** a publisher whose unpaid balance has been
  ≥ `MIN_PAYOUT_ISK` since before the previous payout run should have been
  paid by it; if not, alert (the carry-forward-regression signature).

Reconciliation stays strictly read-only — it never mutates money state.

## Part 3 — Accrual drain hardening (separate PR)

`api/cron-accrue.js` / `services/accrual.ts`:

- **Loop the drain** like `cron-aggregate` does (batches until the queue is
  empty or a per-run batch cap is hit), removing the ~48k/day ceiling.
- **Re-queue on failure:** accrual events carry no signature, so safety
  comes from scoping, not dedup. Processing is grouped per campaign (it
  already is); on an unexpected per-campaign error, THAT campaign's events
  are pushed back onto `events:accrual` and the loop continues with the
  next campaign; on an infrastructure-level failure, all not-yet-processed
  campaigns' events are pushed back. Events whose campaign finished
  charging are never re-queued (re-charging them would double-bill). The
  charge→credit pair within one campaign remains non-atomic, as today —
  the improvement is that a crash no longer destroys the whole batch.
- **Queue-depth visibility:** `events:accrual` depth joins the heartbeat
  payload and `cron-diagnostics`; `checkCronHeartbeats` alerts when depth
  grows across consecutive runs (a draining cron that can't keep up).

## Error handling

- `.create()` collision on a payout doc → log + skip that publisher (already
  paid this run), never throw the whole run.
- A failure mid-loop in accrual re-queues the in-flight batch and stops the
  loop; the next run continues. Heartbeat only writes on a fully successful
  run (existing semantics).
- Reconciliation alert paths reuse the 6h dedupe in `ops-alerts`.

## Testing

Emulator tests for every claim:

- Cumulative basis: credits spread over three months below the old run's
  window all become payable once they cross 10.000; a publisher at 9.999
  is skipped but NOT dropped (still payable next run with more credits).
- Idempotency: running the payout twice for the same period produces one
  doc and one ledger entry.
- Breakdown: `currentPeriodIsk + carriedForwardIsk` equals the gross basis.
- VAT hold: a VAT-registered publisher's doc carries `vatIsk` but the
  ledger entry and disbursed amount are net-only.
- Reconciliation: seeded negative-balance publisher alerts; seeded
  stuck-payable publisher alerts; clean state does not.
- Accrual: multi-batch drain empties a queue larger than one batch; a
  processing failure re-queues the batch (queue depth unchanged after the
  failed run); dedup prevents double-billing on reprocess.
- Copy: marketing-claims check stays green; no "5.000 kr" payout-minimum
  string remains (grep assertion in the test or verify step).

## Rollout

- PR 1: Parts 1+2 + constant + copy sweep + prerender snapshot refresh.
  PR body must flag: first run after merge settles the historical backlog
  as payout docs for the OWNER'S review — money moves only on his manual
  transfers.
- PR 2: Part 3 (accrual). Independent.
- Both via branch → PR → adversarial review → owner merges (oruggt-ship).
- Out of scope until the accountant answers: flipping `DISBURSE_VAT`,
  advertiser-side VSK gate/display changes (memory backlog item 9).
