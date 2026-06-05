# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Birtingur is a self-service display advertising platform for the Icelandic market aimed at **long-tail niche creators** (e.g. food/lifestyle bloggers), not premium publishers. Publishers register a site, declare its content **categories**, and embed ad slots; advertisers buy by **category + budget** ("ads in `matur` for 50.000 kr"), and the platform spreads impressions across all sites in that category. All money is in **ISK** (integer króna, no decimals); VAT is 24%. The product direction and the category-buying design live in `docs/superpowers/specs/2026-06-04-category-network-buying-design.md`.

## Commands

This is a **Turborepo + pnpm** monorepo. Run from the repo root unless noted.

```bash
pnpm install
pnpm dev          # all apps in watch mode
pnpm build        # turbo build (respects ^build dependency order)
pnpm lint
pnpm typecheck
pnpm test         # all package tests via turbo
pnpm format       # prettier --write
```

Per-package: `pnpm --filter @ada/api test` (also `@ada/dashboard`, `@ada/mcp`, `@ada/serving`, `@ada/shared`, `@ada/snippet`, `@ada/firebase-tests`).

### Tests need the Firestore emulator

`apps/api`, `apps/serving`, and `firebase/tests` run against the Firestore emulator (`vitest.config.ts` hardcodes `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, project `ada-test`). The emulator requires a **Java runtime** on PATH (`java -version`); without it these tests fail with "Unable to locate a Java Runtime" before any test runs. Don't run their `vitest` directly unless an emulator is already up. Use the root wrappers, which start/stop the emulator for you:

```bash
pnpm test:api          # runs @ada/api tests inside emulators:exec
pnpm test:rules        # runs Firestore security-rules tests
pnpm emulator          # standalone emulator (firestore:8080, auth:9099, storage:9199, UI:4000)
```

Run a single test file/case: `pnpm --filter @ada/api test -- tests/campaigns.test.ts -t "case name"` — but only with an emulator running (wrap in `firebase --config firebase/firebase.json emulators:exec '...'` otherwise).

`@ada/shared` and `@ada/dashboard` tests are plain `vitest` (no emulator).

## Architecture

Seven workspaces under `apps/*` and `packages/*`. **`@ada/shared` is the dependency root** — every other package builds it first (their `build` scripts run `pnpm --filter @ada/shared build` before `tsc`). Edit shared schemas/types and downstream packages must rebuild to see them.

- **`packages/shared`** — single source of truth. Zod schemas (`schemas/`), TS types, Firestore collection names + typed converters (`firestore/`), ISK/date formatting, and business constants (`constants.ts`: platform fee %, min payout, VAT rate, IAB sizes, frequency caps, cache TTLs). Import everything from `@ada/shared`.
- **`apps/api`** — control-plane REST API. A **Hono** app (`src/index.ts`) mounting `/v1/*` routers. Routes (`src/routes/`) are thin; business logic lives in `src/services/`. Deployed as Vercel functions: the `api/*.js` files are committed JS entrypoints that import from `dist/` (the compiled `src/`). `vercel.json` rewrites everything to `api/index`, plus three standalone cron functions.
- **`apps/serving`** — hot-path ad serving (ad request, impression, click). Optimized for latency with Redis (Upstash) caching in `src/lib/`. Kept separate from `apps/api` because it has different scaling/latency requirements (V1 Vercel, V2 Cloudflare Worker).
- **`apps/dashboard`** — React 19 + Vite SPA, with `pages/{advertiser,publisher,admin}/` role areas, `locales/` (Icelandic UI), TanStack Query (pinned to 5.40.0 via root `pnpm.overrides`).
- **`apps/mcp`** — MCP server, the **publisher-only** integration channel: AI agents create/manage ad slots, fetch embed snippets, set content policy, handle approvals, read stats. Talks to the API over HTTP (`src/lib/api-client.ts`). Advertiser/buying tools were intentionally removed (commit 6973955) — buying happens in the dashboard/REST API, not over MCP.
- **`packages/snippet`** & **`packages/widgets`** — browser-side artifacts built with **esbuild** (not tsc). The snippet is the `<script>` publishers embed; size-budgeted (`pnpm --filter @ada/snippet size`). Served from CDN.

### Cross-cutting concepts

- **Auth** (`apps/api/src/lib/auth.ts`): `Authorization: Bearer <token>`. Three token kinds — Firebase ID tokens (dashboard users), API keys prefixed `ak_` (programmatic/MCP, verified in `services/api-keys.ts`), and the literal `demo-mock-token` which bypasses auth for local/demo (grants admin). Admin status comes from `ADMIN_EMAILS`.
- **Firestore** (`apps/api/src/lib/firebase.ts`): firebase-admin, auto-switches to emulator when `FIRESTORE_EMULATOR_HOST` is set. Collections: `publishers, slots, advertisers, creatives, campaigns, ledger, payouts, stats`.
- **Ad model (category-based)**: a publisher has `categories` (1..n from `AD_CATEGORIES` in `@ada/shared`); slots inherit them. A campaign's `targeting.categories` (not slotIds) decides where it serves. `push-cache.ts` resolves campaigns→slots by category intersection at cache-build time, so the serving hot path (`apps/serving`, `select.ts`) just reads `slot.activeCreatives` from Redis. CPM is **locked** server-side to `FLAT_CPM_ISK` (`createSlot` ignores client price). `GET /v1/categories/inventory` gives the per-category daily-impression forecast shown in the buy flow.
- **Money flow**: advertiser wallets are an append-only **ledger** (`services/ledger.ts`, `wallet.ts`). CPM spend accrues on a cron (`/api/cron-accrue`, every 15 min) — charged **per batch** as `round(FLAT_CPM_ISK * count / 1000)`, publisher credited net of the 20% platform fee. The cron decrements `campaign.budget.remainingIsk` (the enforced cap); `budget:{id}` in Redis is the real-time serve-time gate. Stats aggregate hourly (`/api/cron-aggregate`); publisher payouts run monthly (`/api/cron-payouts`, manual bank transfer marks them complete). Cron endpoints are gated by `CRON_SECRET`. Click/impression events are HMAC-signed (`serving/src/lib/crypto.ts`) and deduped (`seen:{sig}`) to block replay/fraud.
- **Payments**: Teya (card top-ups) under `services/teya/` with `http.ts`/`webhook.ts` and a `stub.ts` for tests; Payday/Blikk is the invoicing/bookkeeping integration (see `docs/superpowers/plans/2026-06-03-10-payday-blikk-integration.md`). Both follow a real-impl + `stub.ts` pattern.
- **Auto-scan** (`services/auto-scan/`, `domain-classifier.ts`): classifies publisher domains (uses `GEMINI_API_KEY`) during approval; also has a `stub.ts`.

## Conventions

- **ESM throughout.** Relative imports inside a package must use the `.js` extension (e.g. `from './routes/publishers.js'`) even though the source is `.ts`.
- Vercel function entrypoints (`apps/api/api/*.js`) are intentionally compiled JS pointing at `dist/` and are excluded from the typecheck tsconfig — don't convert them back to TS (see recent commits e4259e2 / 67d0335).
- Specs and implementation plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/` — consult them before building a feature.
