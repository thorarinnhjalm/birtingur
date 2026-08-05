# Whole-system audit — 2026-08-05

Question asked: "is the system the best it can be?"

Method: six specialist agents audited one dimension each (money correctness,
security/abuse, operational reliability, publisher experience, advertiser
experience, scaling/maintainability), every finding was then adversarially
verified by a second agent instructed to refute it, and the survivors were
synthesized. The findings marked **[verified]** below were then re-read in the
code by the primary session before being reported. Findings marked
**[unverified]** come from the audit and still need a first-hand read before
anyone acts on them.

## Status

Updated as findings are dealt with, so this file stays usable rather than
becoming a snapshot of one afternoon.

| Finding                                         | Status                                        |
| ----------------------------------------------- | --------------------------------------------- |
| Clicks never reach the advertiser               | Fixed — PR #5                                 |
| `type=pageview` bypassed signature verification | Fixed — PR #5 (found while verifying above)   |
| Creative uploads could be overwritten by anyone | Fixed — PR #6                                 |
| One malformed campaign doc stops all serving    | Fixed — PR #7                                 |
| Payouts below the monthly minimum are dropped   | Open — needs owner decision (changes payouts) |
| Publisher VAT disbursed but never collected     | Blocked — needs an accountant's answer        |
| Accrual ceiling and lossy drain                 | Open — growth trap, not urgent                |
| Reconciliation has no publisher-side coverage   | Open                                          |
| Remaining "reported but not verified" items     | Open — verify before acting                   |

Three of the "reported but not verified" items were verified first-hand and are
in the fixed rows above (storage rules, sweep crash, pageview forgery). The rest
of that list has not been re-read yet.

## Verdict

The architecture is genuinely good and the weaknesses are at the edges — where
money enters the system and where it leaves.

Strong: the append-only ledger, the committed-funds reservation gate with
`fundsVersion` transaction serialization, the fail-closed serving budget gate,
the daily read-only reconciliation cron, the MCP agentic-buying guardrails
(no money-in path, monthly cap, auto-approve threshold, a key cannot approve
its own purchase), and a 442-test suite running against a real Firestore
emulator. This is more discipline than most solo projects have.

Weak: click tracking is broken in production, small publishers can never be
paid despite a public promise that they will be, publisher VAT is disbursed
but never collected, and the accrual pipeline has an unmonitored throughput
ceiling with a lossy drain.

## Critical

### 1. Clicks never reach the advertiser [verified]

`apps/serving/src/routes/ad.ts:140` creates **one** signature and uses it for
both the impression pixel (`:141-144`) and the click URL (`:166`). Both
`impression.ts:80` and `click.ts:36` call `claimSignatureOnce(sig, …)`, which
in `lib/crypto.ts` does `SET seen:{sig} NX` — the **same Redis key** for both
event types.

The snippet fires the impression pixel after the IAB viewability delay (~1s),
which burns the signature. Any click after that hits `click.ts:37-39` and
returns `c.text('Already counted', 409)` — the visitor sees a plain 409 page
instead of being redirected to the advertiser's site.

Impact: advertisers pay the flat CPM and receive no measurable traffic; CTR is
structurally near zero. The tests miss it because click and impression are
exercised in separate `describe` blocks with the emulator cleared between them.

Fix: namespace the dedup keys (`seen:imp:{sig}` / `seen:clk:{sig}`), ideally
with separate signatures. Small (hours). Add a regression test that fires the
impression and then the click on the same served ad.

### 2. Publishers under the monthly minimum are never paid, contrary to the published promise [verified]

`services/payouts.ts:15-21` queries `publisher_credit` entries strictly within
`[periodStart, periodEnd]`, and `api/cron-payouts.js:23-24` always sets that
window to the previous calendar month. `payouts.ts:32` then does
`if (netIsk < MIN_PAYOUT_ISK) continue;` — and because no later run ever queries
that period again, the skipped credits are dropped permanently rather than
carried forward. There is no carry-forward record anywhere.

The intended behaviour is the opposite, in the code's own words
(`packages/shared/src/constants.ts:4`: "below this rolls into next month") and
in public copy (`FaqPage.tsx:126`: the amount carries over undiminished and is
paid as soon as the minimum is reached).

Impact: the target market is long-tail creators. A blog earning 2.000–4.000 kr
a month never crosses 5.000 kr in any single calendar month, so it is never
paid anything — while its dashboard keeps showing accrued earnings. The ledger
entries survive, so the money is recoverable, but it is a broken written
promise, not a UX wrinkle.

Fix: make the payout basis cumulative — sum all `publisher_credit` up to
`periodEnd` minus all prior `payout` entries, and pay when that balance clears
the minimum. This also settles the historical backlog on the next run. Give
payout docs a deterministic id (`pay_{publisherId}_{YYYYMM}`) written with
`.create()` so a re-run after a partial failure cannot double-pay. Medium.

### 3. Publisher VAT is disbursed but never collected [verified]

`payouts.ts:37` computes `vatIsk` for VAT-registered publishers and `:98`
disburses `netIsk + vatIsk`. Nothing collects it: `routes/wallet.ts:92` charges
the advertiser exactly `amountIsk` with no VAT added, and
`services/wallet.ts` `creditPublisher` credits only `netIsk` while writing the
`platform_fee` entry.

Two consequences follow directly from the code. First, the payout ledger entry
is `-(netIsk + vatIsk)` against a party that was only ever credited `netIsk`,
so every VAT-registered publisher's ledger balance drifts permanently negative
by the VAT amount. Second, on the cash side, 24% of net is paid out on top of a
20% fee that is all the platform ever took in.

Whether the disbursement itself is correct is a tax question (agent vs
principal treatment) for an accountant, not a code question. What is
unambiguous from the code is that the money movement has no counterpart
anywhere in the ledger and no reconciliation check would ever surface it.

Fix: stop disbursing `vatIsk` until the tax model is settled (keep computing
and storing it as a reported field), then make the collection side match
whichever model the accountant confirms, and record the VAT movements as
ledger entries so reconciliation can see them.

## High

### 4. Accrual has an unmonitored ceiling and loses events on failure [verified]

`api/cron-accrue.js:21` calls `drainAndAccrue(500)` exactly once per run on a
`*/15` schedule — a hard ceiling near 2.000 billable impressions/hour (~48.000
per day). The sibling stats cron loops 5×1000 per hour, so stats can absorb
more than accrual can, and the two will silently diverge under load.
`services/accrual.ts:30` uses `redis.rpop` with no acknowledgement or
re-queue, so any mid-batch failure destroys up to 500 impressions of billing
permanently regardless of traffic level.

Current traffic is far below the ceiling, so this is a growth trap rather than
a live fire. Nothing watches queue depth.

Fix: loop the drain like `cron-aggregate` does, push unprocessed events back on
failure, and add queue depth to the heartbeat check. Medium.

### 5. Reconciliation has no publisher-side coverage [verified]

`services/reconciliation.ts` checks campaign spend, per-campaign money
conservation, the advertiser mirror and Redis budgets. There is no payout
check and no publisher-balance check, which is why findings 2 and 3 above can
both persist indefinitely without a single alert.

Fix: add a per-publisher assertion that `sum(publisher_credit) + sum(payout)`
reconciles, and flag publishers whose unpaid balance has exceeded the minimum
for more than one cycle.

## Reported but not yet verified first-hand

These come from the audit and are ordered by claimed severity. Each needs a
first-hand read before acting.

- A crash in `sweepExpiredCampaigns` (no per-campaign try/catch) would abort
  `cron-refresh-cache` before `refreshAllActiveSlotCaches` runs; with a 1h TTL
  on `budget:{id}` and a fail-closed read, that would stop all serving within
  the hour. Claimed to be reachable from a single malformed campaign document.
- `firebase/storage.rules` reportedly lets any authenticated Google account
  overwrite any advertiser's creative image (`{advertiserId}` never compared to
  the caller).
- `CampaignCreate.tsx` adds 24% VAT client-side and gates on `balanceIsk`
  rather than `availableIsk`, while the server charges no VAT — two bugs that
  currently mask each other.
- `impression.ts` pace check compares a per-impression cost rounded to `1` kr
  against a limit denominated in króna, throttling delivery.
- No validation that an uploaded creative matches `IAB_STANDARD_SIZES`, while
  `push-cache.ts` requires an exact match — a mismatched upload yields a
  campaign that is "active", holds its full budget, and never serves.
- `admin-stats.ts` returns hardcoded `systemStatus: 'OK'` and a fixed p95
  latency, displayed to the owner as system health.
- The cron watchdog runs only inside `cron-aggregate`, so the failure mode it
  exists for (Vercel stops firing crons) produces no signal. An external
  scheduled ping would close this.

## What not to do now

- Do not rewrite the money path onto a real queue. Looping the drain plus
  acknowledgement removes most of the risk for a fraction of the work.
- Do not re-architect the O(slots × campaigns) cache refresh. The wall is
  several hundred active slots away.
- Do not add a maintained running balance to avoid full ledger scans. Today's
  cost is pennies.
- Do not code-split the dashboard bundle. Real debt, no money or trust impact.
- Do not open advertiser self-registration until the buy-flow findings are
  fixed; `REGISTRATION_CLOSED` currently limits the blast radius to
  hand-onboarded advertisers.
