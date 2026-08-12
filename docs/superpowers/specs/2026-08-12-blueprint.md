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

| Invariant                                                                       | Enforced by                                                                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| One served ad's signature works for BOTH the impression pixel and the click     | `apps/serving/tests/click-after-impression.test.ts`                                           |
| Serving sets no cookies, on fill and on no-fill alike                           | `apps/serving/tests/ad-route.test.ts`                                                         |
| Every event reaches `events:stats`; impressions also reach `events:accrual`     | `apps/serving/tests/analytics-fanout.test.ts`                                                 |
| A replayed signature is rejected per event kind                                 | `apps/serving/tests/fraud.test.ts`, `crypto.test.ts`                                          |
| Tracking URLs resolve against `SERVE_BASE`, not the publisher origin            | `packages/snippet/tests/render.test.ts`                                                       |
| A missing or expired `budget:{id}` key stops serving; it never serves free      | `apps/serving/tests/budget-gate.test.ts` (real `getRemainingBudgets` via the `setRedis` seam) |
| The snippet's baked-in `SERVE_BASE` resolves in DNS and carries no stray origin | `packages/snippet/scripts/check-host.mjs`, run in CI after every build (`ci.yml`)             |

**Now.** V1 on Vercel at `serving.birtingur.app`, 14 test files. The snippet is
compiled into the serving app's own `public/widget.js`; there is no separate CDN.

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

**Now.** PR #32 (merged 2026-08-12) raised the batch cap to 20 behind the 30s
deadline, added the re-queue and the `AggregationError.anyCommitted` distinction,
and turned truncation into an ops alert. This subsystem is the one place in the
repo where the invariants are now fully pinned by tests, which is why it reads
shorter than the others.

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

| Invariant                                                       | Enforced by                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Scope decides the tool set; failed resolution registers nothing | `apps/mcp/tests/server-scope.test.ts`                                                             |
| Auth errors are reported as auth errors, not empty tool lists   | `apps/mcp/tests/auth-errors.test.ts`                                                              |
| `create_campaign` carries idempotency and the channel header    | `apps/mcp/tests/create-campaign.test.ts`                                                          |
| **No MCP tool can add funds**                                   | **UNENFORCED** — true by construction (top-ups and refunds are dashboard-only), pinned by nothing |

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

| Invariant                                                    | Enforced by                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Public copy claims nothing beyond the verified USP list      | `scripts/check-marketing-claims.mjs` (runs in `lint`, pre-push) + `apps/dashboard/tests/marketing-claims.test.ts`    |
| Prerender snapshots are never captured against a stale build | `apps/dashboard/tests/prerender-staleness.test.ts` + the capture script's own guard                                  |
| Editorial primitives and key components render               | 14 dashboard test files                                                                                              |
| **Every route in `sitemap.xml` has a snapshot**              | **UNENFORCED** — the sitemap is the source of truth, but nothing fails when a route is missing from `snapshots.json` |

**Now.** React 19 + Vite SPA, Tailwind 4 with brand tokens, prerender pipeline
with a committed snapshot cache. `admin/Overview.tsx` is 2895 lines — not a bug,
just expensive to work in, and the reason to split it is the next time something
forces us into the file.

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
6. Sitemap vs prerender snapshot parity (subsystem 7).
7. MCP tool-list test: no money-adding tool (subsystem 6).
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
