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
- **Alert recipients in production: `ADMIN_EMAILS` is set** (Production and
  Preview, verified by the owner in the Vercel dashboard 2026-08-12), so the
  `opsRecipients()` fallback has a real recipient list. Remaining link in the
  chain: `RESEND_API_KEY` — without it `services/mail.ts` logs the email to
  console instead of sending it, so delivery is only proven once that key is
  confirmed in Production too (or an alert is observed arriving).

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

| Invariant                                                                      | Enforced by                                                                                               |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| One served ad's signature works for BOTH the impression pixel and the click    | `apps/serving/tests/click-after-impression.test.ts`                                                       |
| Serving sets no cookies, on fill and on no-fill alike                          | `apps/serving/tests/ad-route.test.ts`                                                                     |
| Every event reaches `events:stats`; impressions also reach `events:accrual`    | `apps/serving/tests/analytics-fanout.test.ts`                                                             |
| A replayed signature is rejected per event kind                                | `apps/serving/tests/fraud.test.ts`, `crypto.test.ts`                                                      |
| Tracking URLs resolve against `SERVE_BASE`, not the publisher origin           | `packages/snippet/tests/render.test.ts`                                                                   |
| **A missing or expired `budget:{id}` key stops serving; it never serves free** | **UNENFORCED** — every serving test mocks `getRemainingBudgets`, so the real missing-key path is untested |
| **The snippet's baked-in `SERVE_BASE` resolves in DNS**                        | **UNENFORCED** — this is what broke serving for months (`serve.` vs `serving.`); nothing checks it        |

**Now.** V1 on Vercel at `serving.birtingur.app`, 13 test files. The snippet is
compiled into the serving app's own `public/widget.js`; there is no separate CDN.
Fail-closed budget behaviour is implemented (`getRemainingBudgets` reads a
missing key as 0) but not pinned.

**Bridge.**

1. Test the fail-closed budget gate without mocking it: seed no `budget:{id}`,
   assert no fill. Small, and it guards revenue in the direction that matters.
2. Add a build-time or CI assertion that the hostname the snippet is built
   against resolves. A `curl -sI` in CI is enough. This is the single highest
   value test in this document, because its absence cost months of zero serving.

---

## 2. Stats pipeline (`events:stats`, `cron-aggregate`)

**Target.** Numbers on screen are at most an hour behind reality, and when they
cannot be, someone is told. No impression is ever lost or double counted on the
way into a stats document.

**Invariants.**

| Invariant                                                                         | Enforced by                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A failed write does not lose events (whole-batch failure is re-queued)            | `apps/api/tests/stats-drain.test.ts`                                                                                                                                                             |
| A partially committed batch is never re-queued (no double counting)               | `apps/api/tests/stats-drain.test.ts`                                                                                                                                                             |
| Falling behind is never silent (truncation, zero progress, lost events all alert) | `apps/api/tests/stats-drain.test.ts`                                                                                                                                                             |
| An unrecognized event type is skipped, never counted as a click                   | `apps/api/tests/stats-aggregator.test.ts`                                                                                                                                                        |
| Dotted field paths are never written (they are dead fields nobody reads)          | `apps/api/tests/stats-aggregator.test.ts`                                                                                                                                                        |
| A post-write step cannot be misread as "nothing was committed"                    | `apps/api/tests/stats-aggregator.test.ts`                                                                                                                                                        |
| **`events:stats` depth over time is watched, not just readable on demand**        | **UNENFORCED** — depth and oldest-event age are surfaced pull-based in `routes/admin/index.ts` / `services/ops-diagnostics.ts`; the growth alert in `ops-alerts.ts` covers `events:accrual` only |

**Now.** PR #32 (merged 2026-08-12) raised the batch cap to 20 behind the 30s
deadline, added the re-queue and the `AggregationError.anyCommitted` distinction,
and turned truncation into an ops alert. This subsystem is the one place in the
repo where the invariants are now fully pinned by tests, which is why it reads
shorter than the others.

**Bridge.**

1. Extend the `ops-alerts` growth check to `events:stats` with its own baseline
   key, on the hourly caller only (the 10-minute caller must stay
   staleness-only, see subsystem 4).

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

**Bridge.**

1. **VSK confirm copy — decided 2026-08-12** (see Product direction): remove
   the misleading "VSK (24%)" line and total from campaign confirm now; the
   full alignment pass (`DISBURSE_VAT`, Payday/Blikk, all copy in one PR)
   still waits for the accountant.
2. Gross vs net balance display and the top-up prefill — both small dashboard
   items on the same deferred list, both visible to advertisers, neither risky.

---

## 4. Ops visibility (heartbeats, alerts, diagnostics)

**Target.** Any part of the machine going quiet produces a message to a human
within ten minutes, and no single failure can silence the mechanism that would
report it.

**Invariants.**

| Invariant                                                                                                           | Enforced by                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Every successful cron records a heartbeat; a stale heartbeat alerts                                                 | `apps/api/tests/ops-alerts.test.ts`                                                                                                |
| A missing heartbeat bootstraps rather than paging on first deploy                                                   | `apps/api/tests/ops-alerts.test.ts`                                                                                                |
| Alerts dedupe per condition for 6h, so a stuck cron does not page every tick                                        | `apps/api/tests/ops-alerts.test.ts`                                                                                                |
| The accrual backlog-growth check only runs on the hourly caller (a 10-minute sample would flag the normal sawtooth) | `apps/api/tests/ops-alerts.test.ts`                                                                                                |
| A failing watchdog cannot take down the cron hosting it                                                             | code: isolated try/catch in `api/cron-refresh-cache.js` — **UNENFORCED**                                                           |
| **The watchdog is hosted by more than one cron**                                                                    | **UNENFORCED** — true since #32 (cron-aggregate hourly + cron-refresh-cache every 10 min), but it is a wiring fact no test can see |

**Now.** Two callers, email via Resend plus in-app admin notification, plus
`/api/cron-diagnostics` and the admin ops card for pull-based checks.

**Bridge.**

1. A cheap structural test that asserts both cron entrypoints import and call
   `checkCronHeartbeats` (read the two files, assert the call is present). Ugly,
   but it is the only way this invariant survives someone tidying an entrypoint.
2. Alert recipients: `ADMIN_EMAILS` confirmed in Production 2026-08-12 (see
   Product direction). Left to prove delivery end-to-end: `RESEND_API_KEY`
   in Production, or one observed alert email.

---

## 5. Auth and scope (`lib/auth.ts`, `services/api-keys.ts`, Firestore rules)

**Target.** Two token kinds with clearly bounded power: dashboard users act as
themselves, `ak_` keys act within their scope and never touch money movement or
their own approvals. Admin is granted in exactly one place.

**Invariants.**

| Invariant                                                                                                                           | Enforced by                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ak_` keys are blocked from dashboard-only mutations                                                                                | `apps/api/tests/agent-mutation-lockout.test.ts`                                                                                                                                                            |
| Creating a campaign with an `ak_` key requires `purchase.enabled`, respects the monthly cap, and pends above the auto-approve limit | `apps/api/tests/agent-purchase.test.ts`                                                                                                                                                                    |
| A non-admin authenticated user gets 403 on admin routes                                                                             | `apps/api/tests/auth.test.ts`                                                                                                                                                                              |
| MCP registers no tools when scope resolution fails                                                                                  | `apps/mcp/tests/server-scope.test.ts`                                                                                                                                                                      |
| Firestore and Storage rules deny what they should                                                                                   | `firebase/tests/firestore-rules.test.ts`, `storage-rules.test.ts`                                                                                                                                          |
| **Admin comes from `ADMIN_EMAILS` only — no domain-suffix grant, ever**                                                             | **UNENFORCED** — `auth.test.ts` exercises `requireAdmin` with a stubbed flag, not the resolution itself. This is the exact hole that made an unregistered domain a route to `/v1/admin/*` until 2026-08-09 |
| **There is no bypass token**                                                                                                        | **UNENFORCED** — the `demo-mock-token` backdoor was removed in 21b1b29 / 0c0c70a; nothing stops it coming back                                                                                             |

**Bridge.**

1. Test the admin resolution itself: an email in `ADMIN_EMAILS` is admin, a
   same-domain email that is not listed is not. Small, and it pins the most
   expensive class of mistake this repo has made.
2. A test asserting no hardcoded token string grants auth. Cheap insurance
   against a reintroduced dev shortcut.

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

| Invariant                                            | Enforced by                                             |
| ---------------------------------------------------- | ------------------------------------------------------- |
| Schemas, ISK formatting, dates and converters behave | 12 test files in `packages/shared/tests`                |
| **The widgets work**                                 | **UNENFORCED** — `packages/widgets` has no tests at all |

**Bridge.** Smoke-test each of the three widgets: it renders, it fetches, it
fails visibly. Low urgency, but "zero tests" should be a stated fact rather than
a discovery.

---

## 9. Development environment

Not a subsystem, but it costs real hours.

- **`.env.local` makes local API tests hit production Redis.**
  `apps/api/src/lib/env.ts` loads the repo-root `.env.local` at import time, so
  on a developer machine `isRedisConfigured()` is true and tests talk to prod.
  `tests/slot-delivery.test.ts` fails locally for exactly this reason (a real
  `slot:{id}` cache entry gets written to production Redis, then the diagnosis
  reads it) while passing in CI. **Bridge:** keep `.env.local` out of the vitest
  env, or point tests at a stub. Until then, a local-only failure must be
  reproduced in a clean worktree before it is believed.
- Tests need Java for the Firestore emulator, and `--only firestore` matters:
  booting Storage flips creative uploads to the real uploader.

---

## The gap list, in the order worth doing

Enforcement first, because each one converts a remembered fact into a guarded
one:

1. CI check that the snippet's `SERVE_BASE` hostname resolves (subsystem 1).
2. Fail-closed budget gate test without mocks (subsystem 1).
3. Admin resolution test: `ADMIN_EMAILS` only, no domain grant (subsystem 5).
4. `events:stats` growth alert on the hourly watchdog caller (subsystem 2).
5. Structural test that two crons call `checkCronHeartbeats` (subsystem 4).
6. Sitemap vs prerender snapshot parity (subsystem 7).
7. MCP tool-list test: no money-adding tool (subsystem 6).
8. No-bypass-token test (subsystem 5).
9. Widget smoke tests (subsystem 8).
10. `.env.local` out of the test env (subsystem 9).

The owner decisions were asked and answered 2026-08-12 — see Product
direction. What they unlocked, in work-item form: strip the misleading VSK
line from campaign confirm, split `/en` into advertiser and publisher tracks
in the GSC revision, start agent-facing MCP docs, and stop reading serving V2
into any plan. Still pending externally: the accountant's VSK answer, the
2026-08-30 bot readout, and confirming `RESEND_API_KEY` in the Vercel prod
env (`ADMIN_EMAILS` is confirmed; without the Resend key, alert emails only
reach the console).

Product work not listed here is not thereby deprioritised; it is simply not what
this document is for. This is the spine, and the spine should be boring.
