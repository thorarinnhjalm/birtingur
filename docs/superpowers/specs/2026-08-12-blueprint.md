# Birtingur blueprint — target state, current state, and the gap

Written 2026-08-12. Horizon: **~2027-02** (six months out).

This is the document that was missing. Every dated memo under
`docs/superpowers/` describes one moment and rots; three separate sessions
diagnosed the same `cron-aggregate` weakness in three different ways during the
same week because nothing recorded what "correct" means for that subsystem.

## How to read this

Each subsystem below has four parts:

- **Target** — what this subsystem should be by the horizon above.
- **Invariants** — what must always be true. Every invariant names the test
  that enforces it. An invariant marked **UNENFORCED** has no test: it is true
  today only because someone remembered, which means it is a gap item, not a
  guarantee.
- **Now** — verified current state, read from the code on `main` at the time of
  writing (not from memory).
- **Bridge** — the small tasks between Now and Target.

Two rules keep this document alive:

1. **An invariant without a named test is a backlog item, not a fact.** The
   UNENFORCED list is the real backlog. Closing one means writing the test, then
   moving the marker.
2. **The PR that changes behaviour updates this file.** If a diff makes a line
   here wrong, the diff is incomplete. `CLAUDE.md` and `AGENTS.md` both point
   here for exactly that reason.

Items marked **OWNER** are direction, not code: they are drawn from existing
specs and prior decisions and need the owner's confirmation before anyone builds
against them.

---

## Product direction (the part code cannot decide)

Confirmed and stable, restated so nothing drifts:

- **Who** — long-tail Icelandic niche creators (food, lifestyle, hobby blogs),
  not premium publishers. Advertisers buy a **category and a budget**, never a
  site or a slot.
- **Money** — ISK integers, 24% VAT, flat **550 kr. CPM** identical across
  categories, 80/20 split to the creator, monthly payouts with a 10.000 kr.
  minimum.
- **Promises we make in public** — the verified USP list in `AGENTS.md`, and
  nothing beyond it. Notably: stats are **hourly**, never "real-time", and
  serving sets **no cookies at all**.

Owner decisions, asked and answered 2026-08-12. These are settled — do not
re-ask them; a future session that wants to reverse one brings the owner
evidence, not the same question:

- **Agentic buying via MCP is a growth bet.** The next six months include
  agent-facing onboarding and documentation: better error copy, worked
  examples, MCP coverage in the public/llms.txt material. It earns
  prioritisation space alongside the rest of the roadmap.
- **The English site serves both audiences, separated harder.** Keep
  advertisers and publishers on `/en`, but split the structure
  (advertiser-facing vs publisher-facing paths with their own content tracks)
  instead of blending both into one landing narrative. Feeds directly into the
  late-August GSC revision.
- **Bot billing waits for the 2026-08-30 readout.** No billing change before
  the Phase 1 data shows the actual `known_bot` share. If it is negligible the
  decision is small; if it is large it gets its own discussion then.
- **Serving V2 on Cloudflare is written off.** V1 on Vercel IS the serving
  system; performance and reliability investment goes there. Cloudflare only
  returns to the table if measured latency or cost forces it. Any spec still
  implying a V2 migration should be read with this decision on top.
- **VSK confirm-screen copy: remove the misleading line now.** The
  "VSK (24%)" row and the budget+24% total on campaign confirm show a number
  that is never debited and contradict TopUp/FAQ copy. Strip it (point at the
  FAQ instead) without waiting for the accountant; the full alignment pass
  (confirm copy + `DISBURSE_VAT` + Payday/Blikk invoicing, in one PR, never
  piecemeal) still waits for the accountant's answer per
  `follow-ups-2026-08-09.md`.
- **Alert email in production: recipients and API key are now both set.**
  `ADMIN_EMAILS` was already in Production; `RESEND_API_KEY` was NOT — meaning
  no email of any kind (ops alerts, onboarding, agent-purchase notifications)
  had ever left prod before 2026-08-12, everything logged to console. The
  owner added the key and redeployed the same day. The birtingur.app domain
  is verified in Resend (DKIM/SPF green, eu-west-1, verified 2026-08-12), so
  any `@birtingur.app` sender address works without a mailbox existing. Two
  things remain: set `SENDER_EMAIL` (e.g. `ops@birtingur.app`) in Production —
  all five senders in `services/mail.ts` fall back to `onboarding@resend.dev`,
  which Resend only delivers to the account's own address — and observe one
  real email arriving.

Not being built, to be deleted from any spec that still implies otherwise:
the Cloudflare R2 CDN (any `cdn.*` host is fiction), per-category pricing
tiers, real-time stats.

---

## 1. Serving hot path (`apps/serving`, `packages/snippet`)

**Target.** A publisher embeds one script tag and gets ads, or gets a house ad,
and never gets a broken page or a silent black hole. No cookies, one first-party
visitor id, latency low enough that the ad renders with the page. Every served
impression and click is attributable, signed, and counted exactly once.

**Invariants.**

| Invariant                                                                        | Enforced by                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| One served ad's signature works for BOTH the impression pixel and the click      | `apps/serving/tests/click-after-impression.test.ts`                                           |
| Serving sets no cookies, on fill and on no-fill alike                            | `apps/serving/tests/ad-route.test.ts`                                                         |
| Every event reaches `events:stats`; impressions also reach `events:accrual`      | `apps/serving/tests/analytics-fanout.test.ts`                                                 |
| A replayed signature is rejected per event kind                                  | `apps/serving/tests/fraud.test.ts`, `crypto.test.ts`                                          |
| Tracking URLs resolve against `SERVE_BASE`, not the publisher origin             | `packages/snippet/tests/render.test.ts`                                                       |
| A missing or expired `budget:{id}` key stops serving; it never serves free       | `apps/serving/tests/budget-gate.test.ts` (real `getRemainingBudgets` via the `setRedis` seam) |
| The snippet's baked-in `SERVE_BASE` resolves in DNS and carries no stray origin  | `packages/snippet/scripts/check-host.mjs`, run in CI after every build (`ci.yml`)             |
| A campaign gets no more of a slot for uploading more creative variants           | `apps/serving/tests/bandit.test.ts` (cross-campaign fairness)                                 |
| CTR steers only which VARIANT of a campaign serves, never which campaign         | `apps/serving/tests/bandit.test.ts`                                                           |
| Missing, cold or corrupt CTR counters degrade to the pre-bandit even rotation    | `apps/serving/tests/bandit.test.ts` (fail-safe), `apps/api/tests/push-cache.test.ts`          |
| Bot traffic and house-ad fallbacks never feed the CTR counters                   | `apps/serving/tests/analytics-fanout.test.ts`                                                 |
| A visitor's daily frequency cap is per CAMPAIGN, not multiplied by variant count | `apps/serving/tests/bandit.test.ts`, `select.test.ts`, `click-impression.test.ts`             |
| The rotation never acts on a CTR lead built from fewer than a handful of clicks  | `apps/serving/tests/bandit.test.ts` ("refuses to act on noise")                               |
| One campaign's variants in a slot are bounded, and truncation is logged          | `apps/api/tests/push-cache.test.ts`                                                           |

**Now.** V1 on Vercel at `serving.birtingur.app`, 15 test files. The snippet is
compiled into the serving app's own `public/widget.js`; there is no separate CDN.

**Creative rotation (added 2026-08-14).** `selectCreative` draws in two stages:
a CAMPAIGN by weight exactly as before, then one of that campaign's creative
variants by epsilon-greedy on measured CTR. The split is load-bearing: every
advertiser pays the same flat CPM, so letting CTR move impressions BETWEEN
campaigns would starve advertisers who paid the same price and break pacing.

Three gates decide whether the bandit acts at all, and each exists because
removing it produced a measured failure:

- `BANDIT_COLD_START_IMPRESSIONS` (100) — while any variant is short of it, the
  campaign rotates evenly, so an unlucky opening is not fatal.
- `BANDIT_MIN_CLICKS` (5) — the campaign's variants must have earned this many
  clicks between them before any is treated as the winner. Display runs at
  roughly 0.1% CTR, where 100 impressions buys ~0.1 clicks; without this gate
  every variant measures a CTR of exactly zero, the comparison finds no winner,
  and `creativeIds[0]` collects 80% of traffic permanently. Measured with the
  SECOND variant genuinely twice as good: the first still took 3918 of 5000
  impressions. With the gate, the better variant leads 81% of runs against 60%
  without.
- Exact CTR ties are broken at random, never by position in `creativeIds`.

Known limit, measured, accepted: epsilon-greedy locks in. Whichever variant
leads when exploitation starts collects most of the subsequent evidence, so on
the 5%-vs-1% acceptance scenario it averages 730/1000 but finishes below the
70% bar on ~5% of runs. Thompson sampling on a Beta posterior was measured
against the same scenario (mean 885, 1 run in 300 below 700) and is the upgrade
path if this ever matters; epsilon-greedy is what ships because it is what was
specified and it is simple enough to read in the hot path.

Evidence comes from `ctr:{campaignId}:{creativeId}` hashes, written by
`logEvent` inside its existing pipeline (zero extra hot-path round trips) and
read back by `push-cache` in one pipelined batch per slot, baked into
`CachedCreative.ctr`. The hot path therefore does no extra Redis work and
`selectCreative` stays pure and synchronous; the cost is up to 10 minutes of
staleness, which is nothing against a 100-impression threshold.

This required removing push-cache's one-creative-per-campaign `break` — until
then a slot's `activeCreatives` held at most one creative per advertiser, so
two variants of one campaign never met and the bandit had nothing to compare.
One CAMPAIGN per advertiser per slot still holds, and a campaign contributes at
most `MAX_CACHED_VARIANTS_PER_CAMPAIGN` (3) variants to one slot — the entry is
fetched whole on every ad request and `creativeIds` has no upper bound.
Truncation is logged, never silent.

Two knock-on changes the same removal forced:

- The visitor frequency cap moved from per-creative to per-CAMPAIGN keys in
  `vimp:{token}:{day}` (`lib/visitor.ts`, `routes/impression.ts`,
  `SelectionContext.visitorImpressionsToday`). Per-creative counting was
  equivalent while a campaign could place only one creative; afterwards a
  three-variant advertiser would have shown one visitor 9 ads a day against a
  competitor's 3, at the same price, and taken a growing share of that visitor's
  later impressions as single-variant rivals capped out first.
- `services/slot-delivery.ts` already counted every usable creative, so this
  also removes a quiet disagreement between what that diagnosis reported and
  what actually got cached.

**Deploy order matters for this change.** `apps/api` and `apps/serving` are
separate Vercel projects. New push-cache against OLD serving is unsafe: the old
`selectCreative` drew flat over all creatives, so a three-variant campaign would
take 75% of a slot, and the old per-creative frequency cap would triple that
advertiser's daily exposure. Ship the serving half first (it is a no-op while
push-cache still emits one creative per campaign), confirm it is live, then ship
the push-cache half.

**Bridge.** Both items done 2026-08-12 (gap items 1 and 2): the budget gate is
pinned unmocked in `tests/budget-gate.test.ts` (missing key ⇒ fallback,
exhausted ⇒ fallback, Redis down ⇒ 500), and CI verifies after every build
that the built snippet contains exactly the canonical serving origin and that
the host resolves and answers over HTTPS (`check-host.mjs`). The fictional
`deploy-snippet.yml` workflow (uploaded to an R2 bucket nothing serves from)
was deleted in the same change.

---

## 2. Stats pipeline (`events:stats`, `cron-aggregate`)

**Target.** Numbers on screen are at most an hour behind reality, and when they
cannot be, someone is told. No impression is ever lost or double counted on the
way into a stats document.

**Invariants.**

| Invariant                                                                         | Enforced by                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A failed write does not lose events (whole-batch failure is re-queued)            | `apps/api/tests/stats-drain.test.ts`                                                                                                                                         |
| A partially committed batch is never re-queued (no double counting)               | `apps/api/tests/stats-drain.test.ts`                                                                                                                                         |
| Falling behind is never silent (truncation, zero progress, lost events all alert) | `apps/api/tests/stats-drain.test.ts`                                                                                                                                         |
| An unrecognized event type is skipped, never counted as a click                   | `apps/api/tests/stats-aggregator.test.ts`                                                                                                                                    |
| Dotted field paths are never written (they are dead fields nobody reads)          | `apps/api/tests/stats-aggregator.test.ts`                                                                                                                                    |
| A post-write step cannot be misread as "nothing was committed"                    | `apps/api/tests/stats-aggregator.test.ts`                                                                                                                                    |
| `events:stats` depth over time is watched, not just readable on demand            | `ops-alerts.ts` `QUEUE_GROWTH_WATCHES`: consecutive hourly readings both growing past 5000 alert ops, guarded on cron-aggregate's own staleness — `tests/ops-alerts.test.ts` |
| An ad request with no advertiser is counted apart from one that was never seen    | `apps/api/tests/stats-aggregator.test.ts` (`unfilled`), `apps/api/tests/publisher-stats-unfilled.test.ts`                                                                    |
| `unfilled` stays absent, never 0, for windows that predate the counter            | same two files, plus `apps/dashboard/src/components/publisher/TrafficChain.test.tsx`                                                                                         |

**Now.** PR #32 (merged 2026-08-12) raised the batch cap to 20 behind the 30s
deadline, added the re-queue and the `AggregationError.anyCommitted` distinction,
and turned truncation into an ops alert. This subsystem is the one place in the
repo where the invariants are now fully pinned by tests, which is why it reads
shorter than the others.

**The shortfall is two problems, and they are now separate (2026-08-14).**
`pageviews` counts every ad request; `impressions` counts the ones that became
visible, gated on viewability (`packages/snippet/src/render.ts`). The gap
between them therefore blended two failures with opposite owners: nobody bought
the publisher's categories, which is ours to fix, and the ad loaded but was
never scrolled into view, which the publisher fixes by moving the slot. A single
"fill rate" told neither party anything actionable.

`unfilled` closes that: a slot load whose creative was a house ad, a transparent
placeholder or a cold-cache response had no advertiser behind it
(`UNFILLED_CREATIVE_IDS` in `stats-aggregator.ts`). `pageviews - unfilled` is
what filled, `impressions` is what was then seen, and the publisher dashboard
renders the four steps as a chain so every percentage can be checked against a
number on the same screen.

It carries the same absent-not-zero contract as `pageViewsTrue` and for the same
reason: written only when non-zero, so a day predating the counter stays
distinguishable from a day where everything filled. Every window before
2026-08-14 therefore renders as unmeasured rather than as perfect fill.

**Bridge.** Done 2026-08-12 (gap item 4): the growth check generalized into
`QUEUE_GROWTH_WATCHES` in `ops-alerts.ts`, watching both drained queues with
their own baseline keys — `events:stats` at a 5000 floor (an hour of traffic
legitimately queues between drains), guarded on cron-aggregate's staleness,
on the hourly caller only.

---

## 3. Money (`wallet`, `accrual`, `ledger`, `payouts`, `reconciliation`)

**Target.** Every króna is traceable to a ledger entry, no advertiser can spend
money they have not deposited, no publisher is paid for an impression that was
not billed, and any drift is reported the next morning without anyone looking.

**Invariants.**

| Invariant                                                                                             | Enforced by                                                                |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A campaign cannot commit funds the advertiser does not have, even under concurrent creates            | `apps/api/tests/wallet-reservation.test.ts`                                |
| Once a campaign is charged, its events are never re-queued (no double billing)                        | `apps/api/tests/accrual.test.ts`                                           |
| An expired campaign releases its fund hold                                                            | `apps/api/tests/wallet-reservation.test.ts`                                |
| A completed campaign cannot be reactivated                                                            | `apps/api/tests/wallet-reservation.test.ts`                                |
| Publisher gross is computed per publisher, so the campaign charge equals the sum (money is conserved) | `apps/api/tests/accrual.test.ts`                                           |
| A campaign that repeatedly fails to charge is paused rather than serving unbilled forever             | `apps/api/tests/accrual.test.ts`                                           |
| Ledger, `budget.remainingIsk` and Redis `budget:{id}` are cross-checked daily and drift alerts        | `apps/api/tests/reconciliation.test.ts`                                    |
| Emitted vs recorded event counts are cross-checked per hour                                           | `apps/api/tests/reconciliation.test.ts`                                    |
| An `ak_` key can never approve its own pending purchase                                               | `apps/api/tests/agent-purchase.test.ts`                                    |
| Money crons never run on a preview deploy                                                             | `apps/api/tests/preview-guard.test.ts`, `admin-preview-guard.test.ts`      |
| **A payout marked complete corresponds to a bank transfer that happened**                             | **UNENFORCED** — and unenforceable in code; the manual step is the control |

**Now.** The strongest-covered part of the system. 66 API test files, 633 tests.
Accrual is deadline-bounded with per-campaign re-queue; reconciliation is
read-only and alert-only by design.

**Bridge.** All three advertiser-facing display items done 2026-08-12 (PR 4 of
the execution plan):

1. The confirm step shows no VSK line and totals exactly the budget the server
   debits ("Dregst af inneign"), with a note deferring VSK to the FAQ — pinned
   by `CampaignCreate.test.tsx`. The FULL VSK treatment (`DISBURSE_VAT`,
   Payday/Blikk, all copy in one coherent PR) still waits for the accountant;
   do not add VAT figures back piecemeal.
2. Gross vs committed vs available is shown wherever the balance is: the
   advertiser Dashboard wallet card and the TopUp summary both carry a
   "frátekið í virkar herferðir / laust fyrir nýjar" breakdown when anything
   is committed (CampaignCreate's confirm step already had it).
3. The top-up path from a short wallet carries the shortfall
   (`/advertiser/topup?amount=`), and TopUp opens prefilled on it (rounded up
   to a whole thousand, clamped between the 2.000 kr. minimum and a 10 m.kr.
   ceiling) instead of a hardcoded 20.000. The link is pinned by
   `CampaignCreate.test.tsx`; the parsing/rounding/clamping by
   `TopUp.test.tsx` (`initialTopUpAmount`).

---

**One definition of what a publisher earns.** `publisherNetIsk` in
`@ada/shared` is it, and it is deliberately `gross - round(gross * fee)` because
that is how `services/wallet.ts` splits the same money into a credit and a fee.
At the current 20% that expression and `round(gross * (1 - fee))` agree for
every integer gross, so this fixed no live discrepancy — it removed the reason
one could appear. They diverge at 10% and at 30%, where `gross * fee` can land
on a half króna.

Before it, ten call sites derived net independently, and two external surfaces
showed the GROSS figure under the word "tekjur": the embeddable publisher stats
widget and MCP `check_slot_delivery`, both 25% high. The widget cannot import
`@ada/shared`, so `getPublisherStats` returns `netEarningsIsk` for it — and it
falls back to `spendIsk` when that field is absent, which is why
`apps/api/tests/publisher-stats-unfilled.test.ts` asserts the field exists at
all. Agreement with the ledger is pinned in `apps/api/tests/wallet.test.ts`,
against what `creditPublisher` actually writes; a shared-package test can only
re-derive the formula and prove it is deterministic.

## 4. Ops visibility (heartbeats, alerts, diagnostics)

**Target.** Any part of the machine going quiet produces a message to a human
within ten minutes, and no single failure can silence the mechanism that would
report it.

**Invariants.**

| Invariant                                                                                                           | Enforced by                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Every successful cron records a heartbeat; a stale heartbeat alerts                                                 | `apps/api/tests/ops-alerts.test.ts`                                                                                     |
| A missing heartbeat bootstraps rather than paging on first deploy                                                   | `apps/api/tests/ops-alerts.test.ts`                                                                                     |
| Alerts dedupe per condition for 6h, so a stuck cron does not page every tick                                        | `apps/api/tests/ops-alerts.test.ts`                                                                                     |
| The accrual backlog-growth check only runs on the hourly caller (a 10-minute sample would flag the normal sawtooth) | `apps/api/tests/ops-alerts.test.ts`                                                                                     |
| A failing watchdog cannot take down the cron hosting it                                                             | `tests/cron-watchdog-wiring.test.ts` (structural: the call sits in its own try block)                                   |
| The watchdog is hosted by more than one cron                                                                        | `tests/cron-watchdog-wiring.test.ts` (structural: both entrypoints call it; only the hourly one runs the growth checks) |

**Now.** Two callers, email via Resend plus in-app admin notification, plus
`/api/cron-diagnostics` and the admin ops card for pull-based checks.

**Bridge.**

1. ~~A cheap structural test that asserts both cron entrypoints call
   `checkCronHeartbeats`~~ — done 2026-08-12,
   `tests/cron-watchdog-wiring.test.ts` (also pins staleness-only on the
   10-minute caller and the isolated try block).
2. Alert email: `ADMIN_EMAILS` and `RESEND_API_KEY` both in Production and
   the birtingur.app domain verified in Resend, all as of 2026-08-12 (the key
   was missing until then — no email had ever left prod). The default sender
   became `birtingur@birtingur.app` in code (#34). Left: observe one real
   email arriving.

---

## 5. Auth and scope (`lib/auth.ts`, `services/api-keys.ts`, Firestore rules)

**Target.** Two token kinds with clearly bounded power: dashboard users act as
themselves, `ak_` keys act within their scope and never touch money movement or
their own approvals. Admin is granted in exactly one place.

**Invariants.**

| Invariant                                                                                                                           | Enforced by                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ak_` keys are blocked from dashboard-only mutations                                                                                | `apps/api/tests/agent-mutation-lockout.test.ts`                                                                                                                           |
| Creating a campaign with an `ak_` key requires `purchase.enabled`, respects the monthly cap, and pends above the auto-approve limit | `apps/api/tests/agent-purchase.test.ts`                                                                                                                                   |
| A non-admin authenticated user gets 403 on admin routes                                                                             | `apps/api/tests/auth.test.ts`                                                                                                                                             |
| MCP registers no tools when scope resolution fails                                                                                  | `apps/mcp/tests/server-scope.test.ts`                                                                                                                                     |
| Firestore and Storage rules deny what they should                                                                                   | `firebase/tests/firestore-rules.test.ts`, `storage-rules.test.ts`                                                                                                         |
| Admin comes from `ADMIN_EMAILS` only — no domain-suffix grant, ever                                                                 | `auth.test.ts` "admin resolution": a listed address is admin (case-insensitively), a same-domain unlisted address is NOT, an unset list grants nobody, an `ak_` key never |
| There is no bypass token                                                                                                            | `auth.test.ts` "no bypass token": scans `lib/auth.ts` for literal token comparisons (only the `ak_` prefix dispatch is allowed) and for the removed backdoor's markers    |
| An email-bearing token with an unverified address is rejected before any grant                                                      | `auth.test.ts` (401, "Email address must be verified")                                                                                                                    |

**Bridge.** Both items done 2026-08-12 (gap items 3 and 8), plus a pin for the
unverified-email rejection, which was implemented but untested.

---

## 6. MCP surface (`apps/mcp`)

**Target.** A stateless server an agent can use safely: publisher tools manage
inventory, advertiser tools buy within hard money guardrails, and no path exists
that adds money.

**Invariants.**

| Invariant                                                       | Enforced by                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope decides the tool set; failed resolution registers nothing | `apps/mcp/tests/server-scope.test.ts`                                                                                                       |
| Auth errors are reported as auth errors, not empty tool lists   | `apps/mcp/tests/auth-errors.test.ts`                                                                                                        |
| `create_campaign` carries idempotency and the channel header    | `apps/mcp/tests/create-campaign.test.ts`                                                                                                    |
| No MCP tool can add funds                                       | `apps/mcp/tests/tool-allowlist.test.ts`: exact 18-tool allowlist (any new tool fails until consciously listed) plus a money-in name pattern |

**Now.** Six test files. Stateless by construction (fresh server and transport
per request), static `Bearer ak_` auth, no OAuth. The 2026-07-28 spec revision is
a low-impact migration and the SDK has nothing newer to move to.

**Bridge.**

1. A test that enumerates the registered tool names per scope and asserts the
   list contains no money-adding tool. It reads as paranoid until someone adds
   `top_up_wallet` for convenience.
2. Agent-facing onboarding and docs — unblocked 2026-08-12 by the owner's
   "growth bet" decision (see Product direction): better error copy, worked
   examples, MCP coverage in the public material.

---

## 7. Dashboard and public site (`apps/dashboard`)

**Target.** Icelandic-first UI in the Nordic-editorial language, an English
marketing surface that crawlers and answer engines see correctly, and no public
claim the product cannot back.

**Invariants.**

| Invariant                                                         | Enforced by                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Public copy claims nothing beyond the verified USP list           | `scripts/check-marketing-claims.mjs` (runs in `lint`, pre-push) + `apps/dashboard/tests/marketing-claims.test.ts`                    |
| Prerender snapshots are never captured against a stale build      | `apps/dashboard/tests/prerender-staleness.test.ts` + the capture script's own guard                                                  |
| Editorial primitives and key components render                    | 14 dashboard test files                                                                                                              |
| Every route in `sitemap.xml` has a snapshot, and vice versa       | `apps/dashboard/tests/sitemap-snapshot-parity.test.ts`, via the pipeline's own `readRoutes()` so the root-`/` exclusion cannot drift |
| CTR is capped at 100% on every surface that renders it            | `apps/dashboard/src/pages/publisher/Dashboard.test.tsx`, `packages/widgets/tests/widgets-smoke.test.ts`                              |
| The publisher CSV export has as many fields per row as its header | `apps/dashboard/src/pages/publisher/Dashboard.test.tsx` (whole-line assertions + a field count)                                      |

**Now.** React 19 + Vite SPA, Tailwind 4 with brand tokens, prerender pipeline
with a committed snapshot cache. `admin/Overview.tsx` is 2895 lines — not a bug,
just expensive to work in, and the reason to split it is the next time something
forces us into the file.

Clicks are not viewability-gated and impressions are: the pixel fires only after
the ad has been at least half visible for a continuous second, while the ad is
clickable the moment it renders, so clicks legitimately outrun impressions and
CTR can exceed 100%. Serving's own limits are asymmetric the same way (30
impressions/hr against 3 clicks/hr per campaign+IP) and an impression pixel
expires after 1h where a click stays valid for 24h, so the two can land in
different days. Sixteen places render CTR and all of them now clamp. **Nothing
monitors the raw ratio**, so a genuine click-inflation bug would now be
invisible everywhere it is displayed; if that matters, the counter belongs in
`services/reconciliation.ts`, which currently never reads `clicks`.

**Bridge.**

1. Assert sitemap routes and snapshot keys match. Cheap, and it closes the loop
   the staleness guard only half closes.
2. Split `admin/Overview.tsx` opportunistically, not as its own project.

---

## 8. Shared package and widgets (`packages/shared`, `packages/widgets`)

**Target.** One source of truth for schemas, money, constants and converters,
imported everywhere; embeddable widgets that a publisher can drop on a page.

**Invariants.**

| Invariant                                            | Enforced by                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Schemas, ISK formatting, dates and converters behave | 12 test files in `packages/shared/tests`                                                                                        |
| The widgets work                                     | `packages/widgets/tests/widgets-smoke.test.ts`: all three register, render, fetch from `API_BASE` with the key, fail visibly    |
| The built widgets bundle targets the real API origin | `packages/widgets/scripts/check-host.mjs` in CI — added the day the production bundle was found calling `http://localhost:3001` |

**Bridge.** Done 2026-08-12 (gap item 9) — and it was not low urgency after
all: writing the smoke tests surfaced that the PRODUCTION widgets bundle on
serving.birtingur.app had `http://localhost:3001` baked in as its API origin
(the esbuild define's default, same bug shape as the snippet's dead
`serve.` host), so every embedded widget on an external page fetched the
visitor's own machine and rendered its error state. The default is now the
real API origin, and CI verifies the built artifact the same way it verifies
the snippet's.

---

## 9. Development environment

Not a subsystem, but it costs real hours.

- **`.env.local` no longer reaches tests** (fixed 2026-08-12, gap item 10).
  `env.ts` used to load the repo-root `.env.local` unconditionally, so local
  `pnpm test:api` runs inherited real Upstash credentials, wrote `slot:{id}`
  keys into production Redis, and `tests/slot-delivery.test.ts` failed locally
  while passing in CI. `env.ts` now skips the file entirely under Vitest and
  strips shell-exported live-service credentials (Redis, Resend, Teya, Gemini,
  Firebase) the same way it already stripped Firebase's. Pinned by
  `apps/api/tests/env-isolation.test.ts`.
- Tests need Java for the Firestore emulator, and `--only firestore` matters:
  booting Storage flips creative uploads to the real uploader.

---

## The gap list, in the order worth doing

Enforcement first, because each one converts a remembered fact into a guarded
one:

1. ~~CI check that the snippet's `SERVE_BASE` hostname resolves (subsystem 1)~~
   — done 2026-08-12, `packages/snippet/scripts/check-host.mjs` in CI.
2. ~~Fail-closed budget gate test without mocks (subsystem 1)~~ — done
   2026-08-12, `apps/serving/tests/budget-gate.test.ts`.
3. ~~Admin resolution test: `ADMIN_EMAILS` only, no domain grant (subsystem 5)~~ — done 2026-08-12, `auth.test.ts` "admin resolution".
4. ~~`events:stats` growth alert on the hourly watchdog caller (subsystem 2)~~ — done 2026-08-12, `QUEUE_GROWTH_WATCHES` in ops-alerts.ts.
5. ~~Structural test that two crons call `checkCronHeartbeats` (subsystem 4)~~ — done 2026-08-12, `tests/cron-watchdog-wiring.test.ts`.
6. ~~Sitemap vs prerender snapshot parity (subsystem 7)~~ — done 2026-08-12,
   `sitemap-snapshot-parity.test.ts`.
7. ~~MCP tool-list test: no money-adding tool (subsystem 6)~~ — done
   2026-08-12, `tool-allowlist.test.ts`.
8. ~~No-bypass-token test (subsystem 5)~~ — done 2026-08-12, `auth.test.ts`
   "no bypass token".
9. ~~Widget smoke tests (subsystem 8)~~ — done 2026-08-12; found the
   production bundle calling localhost (see subsystem 8).
10. ~~`.env.local` out of the test env (subsystem 9)~~ — done 2026-08-12,
    pinned by `tests/env-isolation.test.ts`.

Execution order, effort estimates and PR grouping for this list live in
`docs/superpowers/plans/2026-08-12-gap-execution-plan.md`.

The owner decisions were asked and answered 2026-08-12 — see Product
direction. What they unlocked, in work-item form: strip the misleading VSK
line from campaign confirm, split `/en` into advertiser and publisher tracks
in the GSC revision, start agent-facing MCP docs, and stop reading serving V2
into any plan. Still pending externally: the accountant's VSK answer, the
2026-08-30 bot readout, and finishing email delivery (key, recipients and
domain verification all landed 2026-08-12; setting `SENDER_EMAIL` in prod
and one observed email close it).

Product work not listed here is not thereby deprioritised; it is simply not what
this document is for. This is the spine, and the spine should be boring.
