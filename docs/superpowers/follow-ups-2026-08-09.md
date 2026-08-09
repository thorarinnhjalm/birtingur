# Follow-ups parked during the 2026-08-08/09 review runs

Nine PRs shipped across two days (#9–#18). Every one went through
adversarial review, and each review parked findings that were real but not
worth blocking the merge. Those rulings lived in gitignored run ledgers
inside temporary worktrees; this file is where they survive.

#18 cleared the two entries that could reach a real user today: the campaign
confirm screen's over-strict funds gate, and Earnings rendering a failed
request as "0 kr.". Everything still listed as Open is a narrowed risk, a
scaling ceiling, or a monitoring gap.

Nothing here is a known-broken behaviour in production. Each item is a
narrowed risk, a scaling limit, or a monitoring blind spot, with the ruling
that put it here.

## Status

| Item                                               | Area        | Severity | Status                |
| -------------------------------------------------- | ----------- | -------- | --------------------- |
| `chargeCampaign` has no idempotency key            | Money       | Highest  | Open                  |
| VSK treatment (confirm copy + publisher payout)    | Money       | High     | Blocked on accountant |
| Earnings shows 0 kr instead of an error state      | Publisher   | Medium   | Fixed in #18          |
| Unpaid-basis read scans full credit history        | Scaling     | Medium   | Open                  |
| Payout + reconciliation unbounded collection reads | Scaling     | Medium   | Open                  |
| Advertiser dashboard shows gross balance           | Advertiser  | Low      | Open                  |
| Top-up page ignores the computed shortfall         | Advertiser  | Low      | Open                  |
| Pipeline-loss check blind below ~51 events/hour    | Monitoring  | Low      | Open                  |
| Pause-failure alert repeats every 15 min           | Monitoring  | Low      | Open                  |
| Flat-but-pinned accrual queue caught by nothing    | Monitoring  | Low      | Open                  |
| Redis pop failure reads as an empty queue          | Monitoring  | Low      | Covered indirectly    |
| Bot classifier `spider` / `baiduspider` overlap    | Measurement | Low      | Open                  |
| Bot share not reported in `cron-diagnostics`       | Measurement | Low      | Deliberate deviation  |

## Money

### `chargeCampaign` has no idempotency key — the highest-value item here

`apps/api/src/services/wallet.ts`. Accrual events carry no signature and no
idempotency key, so a `chargeCampaign` that commits server-side but throws
to the caller can still be re-queued and charged a second time on the next
run. PR #15 narrowed this a long way — the mirror sync no longer rejects
after the ledger write, and a `charged` flag stops the known post-charge
failure paths from re-queueing — but the window is not closed, only made
small.

_Fix:_ an idempotency key on `relatedId` plus a per-batch discriminator, so
a repeat of the same charge is a no-op rather than a second debit.

### VSK treatment — waiting on the owner's accountant

Two questions, one conversation.

**Advertiser side.** The funds gate is no longer part of this: PR #18 moved
the confirm screen onto the same figure the server charges (`budget.totalIsk`,
no VAT component), because the old gate was over-strict by 24% and, since an
insufficient wallet swaps the confirm button for a top-up link, blocked an
advertiser holding exactly enough money from buying at all. That was a bug
under every possible answer to the VAT question, so it did not wait for one.

What remains is the copy. The screen still shows a "VSK (24%)" line and a
"Samtals" figure of budget + 24% — a number that will never be debited, and
one that contradicts the product's own stated model elsewhere: `TopUp.tsx`
and `FaqPage.tsx` both say the deposit is a VAT-free agency credit and that
VAT applies only to the 20% platform fee at serving time, which is 960 kr on
a 20.000 kr budget rather than 4.800 kr on top of it. Those exact rows are
specified in the approved design
(`specs/2026-07-03-redesign-templates/buy-flow.dc.html:126-129`), so changing
them is the owner's call, not a review's.

**Publisher side.** `DISBURSE_VAT = false` in `services/payouts.ts` pauses
VAT disbursement — `vatIsk` is still computed and stored, just excluded from
the paid amount — because the 2026-08-05 audit found VAT was being paid out
and never collected.

_Fix:_ when the answer lands, align the confirm screen's VSK line and total,
the TopUp copy, `DISBURSE_VAT`, and the Payday/Blikk invoicing in one pass.
Do not change any of them piecemeal.

## Publisher-facing

### Earnings shows 0 kr instead of an error state — fixed in #18

`apps/dashboard/src/pages/publisher/Earnings.tsx` now returns an ErrorState
with retry when a money query fails with no data to fall back on. The
predicate is `isLoadingError`, not `isError`: a query that fails while
already holding data keeps that data, and with staleTime 30s plus
refetchOnMount a single blip on a return visit would otherwise have replaced
correct cached figures with a red box.

The original entry assumed the publisher Dashboard already had this guard.
It did not — it had the opposite problem, found while fixing this one. The
publisher shell routed to the onboarding wizard whenever `!publishers`, and
that query runs `retry: false`, so one cold function or one expired token
told an established publisher that the sites they own do not exist. It also
made the Earnings error state unreachable, since nobody gets past the shell
to see it. Both are fixed in #18; a genuinely empty list still onboards.

## Scaling

None of these hurt at current volume. They are recorded so the ceiling is
known before traffic finds it.

- **Unpaid-basis read** (`services/payouts.ts`, `getUnpaidBasisIsk`) scans a
  publisher's entire credit history on every Earnings page load, with no
  `staleTime` on the query. Accrual writes one credit per (publisher,
  campaign) per 15-minute run, so the history grows by roughly 10⁴
  documents a year for an active publisher. _Fix:_ cache the summary, or
  maintain a running balance.
- **Payout and reconciliation full-collection reads.** `generateMonthlyPayouts`
  reads all `publisher_credit` entries and the whole payouts collection each
  run; `checkPublisherBalances` does the same, and reconciliation runs
  **daily** rather than monthly. _Fix:_ pagination or aggregation queries.

## Advertiser-facing

- **Gross balance on the dashboard.** The advertiser overview still derives
  balance and days-of-runway from gross `balanceIsk` rather than available
  balance. Display only — no gate depends on it — but it overstates
  spendable money for anyone running several campaigns.
- **Top-up ignores the shortfall.** `CampaignCreate` computes exactly how
  much is missing, then navigates to a top-up page that hardcodes 20.000 kr.
  _Fix:_ pass the computed amount through.

## Monitoring blind spots

- **Pipeline-loss check is blind at low volume.** The emitted-vs-recorded
  comparison tolerates `max(50, 1%)`, so an hour with fewer than ~51 events
  can never raise a finding even on total loss. Deliberate — a tighter floor
  would produce noise — but it means the check protects nothing until
  traffic grows. Cron heartbeats cover the total-outage case.
- **Pause-failure alert has no dedupe.** When accrual's automatic pause of an
  unbillable campaign fails, ops is paged every 15 minutes for as long as it
  keeps failing. Arguably correct (the campaign is still serving unbilled)
  but it will feel like an incident storm during an outage.
- **A flat-but-pinned accrual queue is caught by nothing.** The depth alert
  fires on growth; a queue stuck high while draining at exactly intake rate
  triggers neither it nor the staleness check. Reaching that state needs an
  unlikely conjunction, since capacity now far exceeds intake.
- **A Redis pop failure reports `drained: 0`**, indistinguishable from an
  empty queue in the cron's JSON. Covered indirectly: the queue then grows
  and the depth alert fires, because the accrue heartbeat stays fresh.

## Measurement

- **Bot classifier pattern overlap.** `/spider/i` also matches a synthetic
  `SpiderMonkey` user-agent (no live mainstream client sends it), and the
  `baiduspider` test row is masked by `/spider/i`, so deleting the
  `baiduspider` pattern would not turn a test red. Both disclosed when the
  classifier shipped.
- **Bot share is not in `cron-diagnostics`.** The design named it as a second
  reporting surface; the implementation put the rolling summary only on the
  admin overview, because `cron-diagnostics` is Redis-only by construction
  and this is a Firestore aggregate. Deliberate deviation, documented in the
  Phase 1 plan.

## Related open work

- **Bot Phase 2** — stop billing for `known_bot` impressions. Gated on two to
  four weeks of Phase 1 data; a scheduled readout fires 2026-08-30. Spec:
  `docs/superpowers/specs/2026-08-09-bot-traffic-classification-design.md`.
- **`docs/superpowers/system-audit-2026-08-05.md`** — the earlier whole-system
  audit. Its remaining open rows are superseded by the work in #9–#16; the
  items that survived are the ones listed above.
