# Gap execution plan — 2026-08-12

Prioritised execution of the blueprint's gap list
(`specs/2026-08-12-blueprint.md`) plus the owner-decided dashboard items.
Scored impact vs effort, grouped into PRs by what reviews well together.
Excluded on purpose: the `/en` split (waits for GSC data late August), agent
MCP docs (own project, needs a content brief), `Overview.tsx` split
(opportunistic by decision), and everything waiting on external answers
(accountant, bot readout).

## Scoring

Impact 1–5 asks "what does this prevent, and how expensive was that class of
failure last time it happened?" Effort is wall-clock including tests and
review, not just typing.

| #   | Item                                           | Impact | Why that impact                                                                                                                                                                                                                                                                                               | Effort                                                                                                                 | Ratio |
| --- | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----- |
| 0   | `turbo-ignore` on all four Vercel projects     | 4      | Cost, directly: every push to every PR builds all four projects today — a docs-only PR burns 4 builds per push (observed 3× on #33 alone, 12 builds for zero code). `turbo-ignore` skips a project when neither it nor its dependencies changed; `packages/shared` changes still correctly rebuild everything | ~1h — `"ignoreCommand": "npx turbo-ignore"` in each app's `vercel.json`, versioned in code instead of dashboard clicks | ★★★★★ |
| 1   | `.env.local` out of the test env               | 4      | Live hazard, not hygiene: every local `pnpm test:api` run today writes `slot:*` keys into **production Redis** and reads prod state; also produces false local failures (slot-delivery) that burn debugging time                                                                                              | ~2h — one guard in `env.ts` or vitest config, verify in clean tree + with `.env.local` present                         | ★★★★★ |
| 2   | CI check: snippet `SERVE_BASE` resolves in DNS | 5      | The exact missing check behind months of zero serving with no error anywhere; highest-blast-radius regression the repo has had                                                                                                                                                                                | ~1h — assert built snippet contains the canonical host + `curl -sI` it in CI                                           | ★★★★★ |
| 3   | Fail-closed budget gate, tested unmocked       | 4      | Guards revenue in the correct direction (under-serve, never serve free); implemented but only ever tested through mocks, so a refactor could silently flip it                                                                                                                                                 | ~3h — serving test with in-memory Redis, no `getRemainingBudgets` mock: missing key ⇒ no fill                          | ★★★★  |
| 4   | Admin resolution test: `ADMIN_EMAILS` only     | 4      | Pins the 2026-08-09 lesson (unregistered domain ⇒ full admin incl. payouts); currently only the middleware is tested, not the grant itself                                                                                                                                                                    | ~1h                                                                                                                    | ★★★★★ |
| 5   | No-bypass-token test                           | 2      | The `demo-mock-token` backdoor was removed; cheap insurance against a convenience shortcut returning                                                                                                                                                                                                          | ~0.5h                                                                                                                  | ★★★★  |
| 6   | VSK line off campaign confirm                  | 3      | Owner-decided 2026-08-12; the screen shows a 24% total that is never debited and contradicts TopUp/FAQ — user-facing wrongness on the buy flow                                                                                                                                                                | ~2h — remove the rows, point at FAQ, adjust any test                                                                   | ★★★★  |
| 7   | Gross vs net balance display                   | 3      | Advertiser sees spendable money overstated when funds are committed to other campaigns; display-only but misleads real buying decisions                                                                                                                                                                       | ~3h — surface the committed-funds figure the server already computes                                                   | ★★★   |
| 8   | Top-up prefill from shortfall                  | 2      | CampaignCreate already computes the shortfall; TopUp hardcodes 20.000 kr — small friction on the money-in path                                                                                                                                                                                                | ~1h                                                                                                                    | ★★★★  |
| 9   | `events:stats` growth alert (hourly caller)    | 3      | Closes the last watcher gap from #32: per-run alerts exist, but slow multi-hour drift with green runs is still invisible                                                                                                                                                                                      | ~2h — mirror the accrual baseline check, own key, tests                                                                | ★★★   |
| 10  | Structural test: two crons call the watchdog   | 2      | The two-host dead-man's-switch is a wiring fact no behaviour test sees; one tidy-up away from silently becoming one host again                                                                                                                                                                                | ~0.5h                                                                                                                  | ★★★★  |
| 11  | Sitemap vs prerender snapshot parity           | 3      | A route added to the sitemap without a captured snapshot ships blank to crawlers and nothing fails; SEO work silently undone                                                                                                                                                                                  | ~1h                                                                                                                    | ★★★★  |
| 12  | MCP tool-list test: no money-adding tool       | 2      | "No MCP path adds money" is a stated guarantee pinned by nothing                                                                                                                                                                                                                                              | ~1h                                                                                                                    | ★★★   |
| 13  | Widget smoke tests                             | 2      | `packages/widgets` has zero tests; embedded on external pages where failures are invisible to us                                                                                                                                                                                                              | ~4h — needs a DOM test env for web components                                                                          | ★★    |

## PR grouping

Grouped so each PR is one reviewable theme, ordered by the ratio above.
Estimates are for the PR as a whole.

**PR 0 — Vercel build hygiene** (item 0, ~1h)
`ignoreCommand: "npx turbo-ignore"` in all four apps' `vercel.json`. One
caveat to verify on the PR itself: the dashboard project already has an
ignored-build-step configured in the Vercel UI (CLAUDE.md documents it) —
the code-level command replaces it, and the UI setting should then be
cleared so there is exactly one source of truth. Acceptance: a docs-only
push builds nothing; a `packages/shared` push builds all four; an
`apps/api`-only push builds only the API.

**PR 1 — Test-environment isolation** (item 1, ~2h)
Alone on purpose: it touches `lib/env.ts`, which every dev flow loads, so it
should not share a review with anything else. Acceptance: with a root
`.env.local` present, `pnpm test:api` passes and no key is written to prod
Redis; without one, behaviour unchanged.

**PR 2 — Serving safety nets** (items 2 + 3, ~4h)
Same subsystem, same theme: the two guards that protect serving revenue.
DNS assertion for the snippet host, and the fail-closed budget gate tested
without mocks. Acceptance: CI fails if the baked-in serving host stops
resolving; a campaign with no `budget:{id}` key gets no fill in a real
(in-memory) Redis test.

**PR 3 — Auth grant pins** (items 4 + 5, ~1.5h)
Two small tests in the same area: admin comes from `ADMIN_EMAILS` only (a
same-domain address NOT on the list is denied), and no hardcoded token string
grants auth. Pure test additions, near-zero risk.

**PR 4 — Advertiser money display** (items 6 + 7 + 8, ~5h)
One theme — what the advertiser sees about their money — and the only PR with
user-visible changes, so it gets the preview-link manual check: confirm screen
without the VSK line, balance showing committed vs available, top-up prefilled
with the computed shortfall. VSK removal is the owner-decided piece; the full
VSK alignment (DISBURSE_VAT, Payday/Blikk) still waits for the accountant and
is NOT in this PR.

**PR 5 — Ops watchers** (items 9 + 10, ~2.5h)
Both in ops-alerts/cron wiring: the `events:stats` baseline growth check on
the hourly caller, and the structural two-hosts test for the watchdog.

**PR 6 — Remaining pins** (items 11 + 12, ~2h)
Two independent tiny tests (dashboard prerender parity, MCP tool list). Low
risk, can trail everything else.

**PR 7 — Widget smokes** (item 13, ~4h) — optional
Only if the widgets are actually embedded anywhere today; check first, and
skip if not.

## Order and rationale

0 → 1 → 2 → 3 → 4 → 5 → 6 → (7). PR 0 goes first because every subsequent PR
in this plan gets cheaper the moment it lands — most of them touch one app or
docs only, so they'd each skip three of four builds. PR 1 next because it is
the only item actively causing harm on every test run today. PR 2 carries the
highest prevented-cost. PR 3 is nearly free. PR 4 is the visible one and the
only one needing the owner's eyes on a preview. PRs 5–6 are cleanup-grade.
Total for PRs 0–6: roughly two working days.

Each PR updates the blueprint's UNENFORCED markers it closes, per the rule in
the blueprint itself.
