# Advertiser-MCP: Agentic Campaign Buying — Implementation Plan

> **Status: PARKED.** Trigger: the first external party asking "can my agent buy from you?", or a decision to use agentic buying as marketing differentiation. Do not start before the trigger fires. This plan was pre-written (2026-07-27) so the response time from trigger to shipped feature is short.

**Goal:** Let AI agents buy category campaigns over MCP — "keyptu birtingar í `matur` fyrir 30.000 kr. í viku" — with hard money guardrails, reversing the deliberate removal of advertiser tools in commit 6973955 now that the reservation gate and reconciliation cron exist to make it safe.

**Why this is low-risk now:** the buy unit is already machine-friendly (category + budget, flat CPM, no negotiation); the committed-funds gate (`services/campaigns.ts`) makes wallet oversubscription impossible regardless of what an agent does; `cron-reconcile` audits everything daily; top-ups stay human-only (Teya card flow in the dashboard), so an agent can never add money — only allocate what its owner deposited.

## Design summary

- **Opt-in purchase capability per API key.** `ApiKeyRecord` (`services/api-keys.ts`) already has `scope: 'advertiser' | 'publisher' | 'both'` but nothing enforces it and no purchase rights exist. Add an explicit `purchase` block: `{ enabled: boolean, monthlyCapIsk: number, autoApproveLimitIsk: number }`. Keys default to `purchase.enabled = false`; the owner turns it on in the dashboard.
- **Monthly cap derived, not counted.** Campaigns record their origin (`createdVia: { channel: 'mcp', apiKeyId }`); the month's agent spend for a key = sum of `budget.totalIsk` over campaigns created via that key in the calendar month. No separate counter to drift — same philosophy as the ledger.
- **Human approval above the limit.** A purchase where `totalIsk > autoApproveLimitIsk` creates the campaign in `pending_approval` with an in-app + email notification to the owner; the dashboard approve action activates it. Below the limit it activates immediately (subject to the normal creative-approval status logic).
- **Idempotency.** Agents retry. `POST /v1/campaigns` accepts an `Idempotency-Key` header; a replay returns the original campaign instead of buying twice.
- **No new money paths.** MCP gets no top-up tool, no refund tool, no budget-increase tool in v1. Increase/pause go through the dashboard until there's demand.

## Global constraints

- All money in integer ISK; every gate fail-closed (missing/invalid purchase config ⇒ refuse).
- The committed-funds gate remains the single funding authority — MCP adds _additional_ restrictions (cap, approval), never bypasses.
- User-facing copy (notifications, dashboard) in Icelandic; tool descriptions in English (MCP convention).
- ESM `.js` relative imports; per-task gate: `pnpm --filter @ada/api test` (emulator) + `pnpm --filter @ada/mcp test` + typecheck + lint.

### Task 1: Shared schema + API-key purchase config

- [ ] `packages/shared/src/schemas/campaign.ts`: optional `createdVia: { channel: z.enum(['dashboard','api','mcp']), apiKeyId: z.string().optional() }`.
- [ ] `services/api-keys.ts`: add `purchase?: { enabled: boolean; monthlyCapIsk: number; autoApproveLimitIsk: number }` to `ApiKeyRecord`; extend `issueApiKey`; new `updateApiKeyPurchase(id, cfg)` with zod validation (cap ≥ limit ≥ 0, integers).
- [ ] Route + dashboard settings surface for the owner to enable/configure purchase on a key (API-keys page; `PillButton`/editorial primitives).
- [ ] Tests: config validation, defaults off.

### Task 2: Purchase-aware campaign creation in the API

- [ ] `routes/campaigns.ts` POST: when auth is an `ak_` key, require `scope` advertiser/both AND `purchase.enabled`; compute month-to-date agent spend for the key (query campaigns by `createdVia.apiKeyId` + `createdAt` range); reject if `spent + totalIsk > monthlyCapIsk` with `MONTHLY_CAP_EXCEEDED` (402) — check INSIDE the existing create transaction to avoid a race between two agent calls.
- [ ] `Idempotency-Key` support: Firestore lookup (`campaigns` where `createdVia.idempotencyKey ==`) inside the transaction; on hit return the existing campaign with `idempotent: true`.
- [ ] Above `autoApproveLimitIsk` ⇒ force status `pending_approval` + `createNotification` (advertiser role, Icelandic copy: "Agent óskar eftir herferð upp á X kr. — samþykktu eða hafnaðu") + `sendMail` if configured.
- [ ] Funds are committed at create even while pending (the reservation gate already treats `pending_approval` as fund-holding — verify, don't change).
- [ ] Tests (emulator): cap enforcement incl. two concurrent creates racing the cap; idempotent replay returns same id and charges once; approval-threshold path.

### Task 3: Owner approval flow

- [ ] `POST /v1/campaigns/:id/approve` and `/reject` (dashboard auth, owner only; reject releases the hold by marking `completed` with `remainingIsk: 0` — reuse the approvals.ts pattern, NO refund entry).
- [ ] Dashboard: pending-agent-campaign card on advertiser dashboard (editorial primitives, Icelandic).
- [ ] Tests: approve activates + pushes cache; reject releases committed funds.

### Task 4: MCP advertiser tools

New module `apps/mcp/src/tools/advertiser/` mirroring `tools/publisher/` (`register.ts` pattern). `createMcpServer(apiKey)` resolves the key's scope and registers ONLY matching tool sets (this also retro-fixes scope enforcement for publisher keys). Tools (thin wrappers over the REST API via `lib/api-client.ts`):

- [ ] `list_categories` — categories + per-category inventory forecast (`GET /v1/categories/inventory`).
- [ ] `get_wallet` — balance/committed/available + month-to-date agent spend and remaining cap for this key.
- [ ] `list_creatives` — the advertiser's approved creatives (agents buy with existing creatives in v1; generation is the separate AI-creative plan).
- [ ] `create_campaign` — categories, budget, schedule, creativeIds, auto-generated idempotency key param; response states clearly whether the campaign is live or awaiting owner approval.
- [ ] `get_campaign` / `list_campaigns` — status + spend so agents can report back.
- [ ] Tool descriptions must state the guardrails (cap, approval threshold) so agents can plan around them.
- [ ] Tests: `@ada/mcp` unit tests for registration-by-scope; one integration test against the API test harness.

### Task 5: Docs + guardrail review

- [ ] CLAUDE.md: update the `apps/mcp` bullet (publisher-only ⇒ scoped; note this deliberately supersedes commit 6973955 and why).
- [ ] `docs/mcp-feedback.md` / MCP landing text: document the purchase scope, caps, and that top-ups remain dashboard-only.
- [ ] Adversarial review pass (Opus) focused on: cap race soundness, idempotency under retry storms, any path where an agent key reaches money endpoints beyond create/read.
