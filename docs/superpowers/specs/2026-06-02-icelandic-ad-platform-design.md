# Icelandic Self-Service Ad Platform — Design

**Date:** 2026-06-02
**Status:** Draft for review
**Relationship to markadssetning.is:** Standalone product; markadssetning.is is a first-class API consumer (human-in-the-loop, never autonomous).

---

## 1. Overview

A two-sided self-service advertising marketplace for the Icelandic market. Advertisers buy display banner placements on Icelandic publisher websites; publishers monetize traffic with minimal configuration. Both sides are self-service through a hosted dashboard, embeddable widgets, and an MCP server (first-mover capability for AI agents).

**Positioning:** Traditional self-service ad platform for the Icelandic market (revenue-focused). MCP support is a first-mover differentiator and competitive moat, not the headline marketing message.

**Differentiators vs. existing Icelandic ad sales:**

- True self-service (no sales calls, no IO)
- Cookie-less by default; rides on publisher's existing CMP for any consent-gated features
- Transparent pricing (CPM or fixed time-slot, publisher's choice)
- Flexible ad sizes — publishers can define sizes matching their layout, not locked to IAB
- API-first: hosted dashboard, embeddable widgets, and MCP server are all clients of the same REST API
- Wallet/prepaid billing model — one Blikk (or Teya) charge per top-up, with automated Payday VAT invoicing

## 2. Decisions Reference

| #   | Decision                              | Choice                                                                                                                                               |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q2  | Marketplace structure                 | Two-sided self-service, Canva integration considered future                                                                                          |
| Q3  | Pricing model                         | Publisher chooses CPM or fixed time-slot per slot                                                                                                    |
| Q4  | Ad formats                            | Banner only in V1, IAB-aligned sizes; flexible sizes supported                                                                                       |
| Q5  | Targeting                             | Site+slot selection + optional geo (capital / countryside / all Iceland)                                                                             |
| Q6  | Approval                              | Auto-scan + admin manual review; publisher per-slot opt-in for own approval queue                                                                    |
| Q7  | markadssetning.is integration         | API-only, human-in-the-loop, no autonomous agent buying                                                                                              |
| Q8  | Integration depth                     | Standalone product, markadssetning.is consumes API                                                                                                   |
| Q9  | Payments                              | Blikk (A2A open banking) + prepaid wallet model (Teya as card backup)                                                                                |
| Q10 | Tech stack                            | React 19/Vite/Tailwind v4/Firebase for warm path; serving on Vercel function + Redis in V1, migrate to Cloudflare Worker + KV when traffic justifies |
| Q11 | MVP scope                             | Friend's own properties as initial publishers; markadssetning.is as initial advertiser source                                                        |
| —   | MCP positioning                       | First-class from day 1 as competitive moat, not lead marketing story                                                                                 |
| —   | Headless / "AI builds your dashboard" | Documented optional feature; embed widgets are the real developer-friendly answer                                                                    |
| —   | GDPR                                  | Publisher acts as controller (their CMP governs consent); we are processor. No IP storage; geo from `CF-IPCountry` only                              |
| —   | Goal orientation                      | Revenue product; PR is bonus                                                                                                                         |

## 3. Architecture

### 3.1 Component map

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT SURFACES                        │
├─────────────────────────────────────────────────────────────────┤
│  Hosted Dashboard     Embed Widgets        MCP Server           │
│  (React 19 / Vite)    (Web Components)     (HTTP MCP)           │
│         │                   │                    │              │
│         └─────────┬─────────┴─────────┬──────────┘              │
│                   ▼                   ▼                          │
│           ┌──────────────────────────────┐                       │
│           │   REST API (Vercel fn)       │                       │
│           │   - Firebase Auth            │                       │
│           │   - Service-account API keys │                       │
│           └──────┬──────────┬────────────┘                       │
└──────────────────┼──────────┼─────────────────────────────────────┘
                   ▼          ▼
        ┌──────────────┐  ┌──────────┐       push on change
        │  Firebase    │  │  Blikk/  │      ┌─────────────────┐
        │ (Auth +      │  │  Payday  │      │  Redis (V1)     │
        │  Firestore)  │  │ API/hook │      │  Cloudflare KV  │
        └──────────────┘  └──────────┘      │  (V2)           │
                                            └────────┬────────┘
┌────────────────────────────────────────────────────┼────────┐
│                      HOT PATH                      │        │
├────────────────────────────────────────────────────┼────────┤
│  Publisher site                                    ▼        │
│  ┌──────────────────┐               ┌──────────────────┐    │
│  │ <div data-slot>  │   GET /v1/ad  │  Serving fn      │    │
│  │ snippet.js (3kb) │──────────────▶│  - Vercel (V1)   │    │
│  │  - reads CMP     │◀── ad JSON ───│  - CF Worker(V2) │    │
│  │  - fail silent   │               │  + Redis/KV cache│    │
│  │  - render banner │               │  + Analytics Eng │    │
│  └──────────────────┘               └──────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Components

1. **REST API** (`api.birtingur.app`) — Vercel functions, TypeScript, Firebase Auth. Source of truth for all operations. Every client (dashboard, widgets, MCP) is a thin caller.

2. **Hosted Dashboard** (`www.birtingur.app`) — React 19 + Vite + Tailwind v4 + Firebase, mirroring markadssetning.is stack. First-class product surface: advertiser flow (top-up, create campaign, view stats), publisher flow (slots, stats, approvals, payout setup), admin flow (creative review queue, payout processing, platform settings).

3. **Embed Widgets** (`serving.birtingur.app`) — Web components published to npm + CDN. Drop-in stats and approval-queue components for developer-friendly publishers. Authenticated with scoped widget keys, not Firebase tokens.

4. **MCP Server** (`mcp.birtingur.app`) — Vercel HTTP MCP server. Thin shim over REST API. Bilingual tool documentation (IS/EN). Power-user / future-proofing interface; first-mover positioning for AI-agent-driven publishers and advertisers.

5. **Hot-path serving** (`serving.birtingur.app`) — V1: Vercel function + Upstash Redis cache. V2 (when traffic >50k impressions/day): Cloudflare Worker + KV. Same JSON response contract across both implementations; snippet does not change.

6. **Snippet** (`serving.birtingur.app/widget.js`) — ~3kb static JS, no dependencies. Reads `data-adplatform-slot` attributes, respects publisher CMP, calls serving endpoint, renders banner, fails silently on any error.

### 3.3 Key principles

- **API-first.** Every UI surface is a client of the REST API; no operation is locked behind hosted UI except payment checkout (PCI requirement).
- **Hot/warm separation.** Serving endpoint never touches Firestore directly; reads from Redis/KV cache that is pushed on change from warm path.
- **Hot-path implementation is replaceable.** V1 Vercel function and V2 Cloudflare Worker speak identical JSON contract; migration is transparent to publishers.
- **No PII in hot path.** Cache contains no user data; analytics events store country (from CF header) and hashed visitor token, never IP.
- **Publisher is the data controller.** Their CMP governs consent. We are a processor with a DPA template.
- **Fail silent on serving errors.** A broken ad endpoint must never break a publisher's page layout.

## 4. Data Model

### 4.1 Firestore (warm path)

Dedicated Firebase project, separate from markadssetning.is but in the same Firebase organization.

```
publishers/{publisherId}
  ownerEmail: string
  domain: string
  displayName: string
  payoutMethod: { type: "bank", iban, kennitala, accountName }
  contentPolicy: {
    blockedCategories: string[]
    requireManualApproval: boolean
  }
  status: "active" | "suspended"
  createdAt: timestamp

slots/{slotId}
  publisherId: string
  name: string
  sizes: [{ width: number, height: number }]
  pricing: {
    mode: "cpm" | "slot"
    cpmIsk?: number
    slotPriceIsk?: number
    slotPeriodDays?: number
  }
  placement: {
    pageMatcher: string
    position: "above_fold" | "in_content" | "sidebar"
  }
  status: "active" | "paused"

advertisers/{advertiserId}
  ownerEmail: string
  companyName: string
  kennitala: string
  vatNumber: string
  walletBalanceIsk: number  // mirror of ledger sum, not source of truth
  status: "active" | "suspended"
  createdAt: timestamp

creatives/{creativeId}
  advertiserId: string
  imageUrl: string   // Firebase Storage
  width: number
  height: number
  clickUrl: string
  reviewStatus: "pending" | "auto_approved" | "manual_approved" | "rejected"
  reviewLog: [{ at, by, action, reason }]
  autoScanResult: {
    nsfwScore: number
    blockedTerms: string[]
    category: string
    confidence: number
  }

campaigns/{campaignId}
  advertiserId: string
  creativeIds: string[]
  targeting: {
    slotIds: string[]
    geoCountries?: string[]
    geoRegions?: string[]
  }
  schedule: { startsAt: timestamp, endsAt: timestamp }
  budget: {
    mode: "cpm_capped" | "slot_purchased"
    totalIsk: number
    remainingIsk: number
  }
  status: "draft" | "pending_approval" | "active" | "paused" | "completed"
  perPublisherApproval: { [publisherId]: "pending" | "approved" | "rejected" }

ledger/{entryId}  // immutable append-only
  party: { type: "advertiser" | "publisher", id: string }
  type: "topup" | "campaign_charge" | "publisher_credit" | "payout" | "refund" | "platform_fee"
  amountIsk: number  // signed
  relatedId: string  // campaignId | payoutBatchId | teyaTxnId
  createdAt: timestamp

payouts/{payoutId}
  publisherId: string
  periodStart: timestamp
  periodEnd: timestamp
  grossIsk: number
  platformFeeIsk: number
  netIsk: number
  status: "pending" | "processing" | "completed"
  bankReference: string

stats/{campaignId}/hourly/{YYYYMMDDHH}  // aggregated from Analytics Engine
  impressions: number
  clicks: number
  spendIsk: number
  byPublisher: { [publisherId]: { impressions, clicks, spendIsk } }
```

### 4.2 Cache (Redis V1 / Cloudflare KV V2) — hot path

```
key: slot:{slotId}
value: {
  slotId, publisherId,
  sizes: [...],
  pricing: { mode, cpmIsk?, slotPriceIsk? },
  activeCreatives: [
    {
      creativeId, imageUrl, clickUrl, width, height,
      campaignId, weight, geoFilter?, frequencyCap?,
      budgetExhausted: boolean,
      validFrom, validTo
    }
  ],
  contentPolicy: { blockedCategories: [...] },
  refreshedAt: timestamp
}
```

Push triggers (warm path → cache):

- Creative approved → add to activeCreatives
- Campaign starts / ends / pauses
- Budget exhausted (decrement crosses zero)
- Slot policy or pricing change

### 4.3 Analytics Engine (impressions/clicks)

```
event_type: "impression" | "click"
slot_id, creative_id, campaign_id, publisher_id, advertiser_id
country: string  // from CF-IPCountry, never IP
ts: timestamp
visitor_token: string  // hashed first-party cookie, for frequency cap only
```

Vercel cron aggregates hourly into `stats/{campaignId}/hourly/...` for dashboard display.

### 4.4 Invariants

- **Ledger is source of truth for money.** `walletBalanceIsk` on advertiser doc is a mirror; can be recomputed any time by summing ledger entries.
- **Cache is derivable from Firestore.** Cache loss has no permanent impact; full rebuild possible.
- **No PII in cache or Analytics Engine.** IP never stored anywhere.

## 5. Ad Serving Flow

### 5.1 Publisher snippet contract

```html
<div data-adplatform-slot="slot_abc123" style="min-height:250px"></div>
<script async src="https://serving.birtingur.app/widget.js"></script>
```

No config, no API key, no per-page initialization. Slot ID encodes the publisher.

### 5.2 Snippet behavior

1. On DOMContentLoaded, find all `[data-adplatform-slot]` elements.
2. Read publisher CMP consent (`window.__cmpConsent`, configurable per publisher).
3. For each slot, `GET https://serving.birtingur.app/v1/ad?slot={id}&consent={full|none}&v=1`.
4. On response:
   - `{ empty: true }` → hide slot (`display:none`).
   - `{ creativeId, imageUrl, clickUrl, width, height, impressionPixel, ttl }` → render `<a href="{clickRedirect}"><img></a>` and 1×1 impression pixel.
5. On error, timeout >2s, or network failure → fail silent, hide slot. Never write to console.

### 5.3 Serving endpoint logic

```
1. Lookup slot:{slotId} in cache.
   Cache miss → read Firestore, populate cache, continue.
2. Filter activeCreatives by:
   - schedule (currentTime within [validFrom, validTo])
   - budgetExhausted = false
   - geo (CF-IPCountry header) if consent=full
   - frequencyCap exhausted (Redis counter on visitor_token) if consent=full
3. Select one:
   - slot-purchased campaigns take priority
   - CPM campaigns weighted by effective bid
4. Fire-and-forget: log impression to Analytics Engine; decrement Redis budget counter.
5. Return JSON with impressionPixel URL pointing back to /v1/impression for billing verification.
6. p95 target: <50ms.
```

### 5.4 Click flow

Click URL in rendered banner points to `https://serving.birtingur.app/v1/click?c={creativeId}&s={slotId}&t={visitorToken}`. Server logs click → 302 redirect to actual `clickUrl`. Server-side counting avoids JS dependency and ad-block interference on click tracking.

### 5.5 Budget exhaustion

When Redis budget counter for a campaign crosses zero, the campaign is marked `budgetExhausted=true` in cache. Within seconds, no further impressions for that campaign are served. Aggregated daily reconciliation against ledger ensures cache state matches Firestore.

### 5.6 Frequency cap

If consent=full, snippet sets first-party cookie `_adp_v={shortHash}` (90 day TTL). Server uses Redis sorted set per visitor hash to enforce per-creative cap (default 3 impressions/day/visitor; configurable per campaign).

### 5.7 Out-of-scope for V1

- Programmatic bidding / auction
- Native ad format
- Video
- Retargeting (would require behavioral profiles)
- Cookie-based cross-publisher tracking

## 6. Billing & Wallet

### 6.1 Top-up flow

1. Advertiser → "Add credit" in dashboard → select amount (5k / 20k / 50k / 100k / custom).
2. Vercel function initiates a payment link via Blikk API (A2A open banking transfer) or Teya Checkout API (for credit cards).
3. Advertiser completes authentication in their bank app (via Rafræn skilríki) or card details.
4. Blikk (or Teya) webhook → verify signature → append ledger entry `{ type: "topup", amountIsk: +X, relatedId: txnId }`.
5. Mirror `walletBalanceIsk` on advertiser doc.
6. API automatically calls Payday API (POST /invoices) to issue a 24% VAT paid invoice to the advertiser's kennitala. In V1/Phase 1 this can be manual; in Phase 2/3 it is fully automated through Payday.

### 6.2 Campaign charging

- **Slot-purchased mode:** Single ledger entry at campaign creation. Price = `slotPriceIsk × periodLengthMultiplier`. Reserves the slot — concurrent purchase blocked at API layer.
- **CPM mode:** Streaming charges. Per-impression decrement of Redis counter. Hourly Vercel cron batches into summed ledger entries to avoid per-impression Firestore writes.

### 6.3 Publisher credit

For each campaign charge, a paired ledger entry credits the publisher (minus platform fee, default 20%):

```
{ party: { type: "publisher", id }, type: "publisher_credit", amountIsk: +X*0.8 }
{ party: { type: "platform" }, type: "platform_fee", amountIsk: +X*0.2 }
```

### 6.4 Payout

- Monthly Vercel cron: sum `publisher_credit` for previous month per publisher.
- Create `payouts/{payoutId}` with status `pending`.
- V1: Admin views payout queue, executes manual bank transfer to publisher's IBAN, marks completed.
- V2: Payday API / Blikk API payouts, or Icelandic bank business API for automated transfer.
- Minimum payout threshold: 5,000 ISK. Below threshold rolls to next month.

### 6.5 Platform fee

Default 20%. Stored in `settings/billing.platformFeePercent`, mutable without deploy. Future: per-publisher negotiated rates for large media partners.

### 6.6 Refunds

If a campaign is stopped mid-flight (e.g., manual review rejects after launch, technical fault), unspent budget refunded as `{ type: "refund", amountIsk: +X }`. Returns to wallet balance, not to card — card refund complicates VAT.

### 6.7 VAT (Iceland)

- Top-ups: 24% VAT included. Invoice issued by us (the platform operator).
- Publisher payouts: publisher's own taxable income; we issue annual statement.
- V1: manual bookkeeping. V2: automated integration.
- **Out of scope, must happen in parallel:** Legal/tax consultation before first third-party ad serves.

## 7. Approval Workflow

### 7.1 Auto-scan (on creative upload)

Run synchronously on creative upload, ~1-3 seconds:

- NSFW / violence: Google Cloud Vision SafeSearch or OpenAI moderation API.
- OCR on image → check against blocked-term lists (gambling, alcohol if publisher blocks, illegal substances).
- Click URL: Google Safe Browsing API, redirect-chain analysis (bait-and-switch defense).
- Brand-safety category classification (`food`, `finance`, `tech`, etc.), stored on creative.

Outcomes: `auto_approved` | `flagged_for_manual` | `auto_rejected`.

Strict cutoff: prefer false positives (flag clean creatives) over false negatives (let dirty ones through).

### 7.2 Publisher policy layer

Per publisher:

```
contentPolicy: {
  blockedCategories: ["gambling", "alcohol"],
  requireManualApproval: false
}
```

- `requireManualApproval=false` (default for vibe-coder publishers): auto-approved creatives serve immediately on matching slots.
- `requireManualApproval=true` (default for editorial publishers): all candidate creatives enter publisher's approval queue; publisher approves/rejects per creative in dashboard or via MCP/widget.
- `blockedCategories` filters regardless of manual review state.

### 7.3 Admin review

Only `flagged_for_manual` from auto-scan. SLA target: 4 business hours.

Admin dashboard surface:

- Queue with creative preview, scan results, and metadata.
- Approve / Reject (with reason) buttons.
- Bulk actions for repeat offenders by advertiser.

### 7.4 Appeals

Rejected creatives display reason to advertiser. Advertiser can appeal once per creative → enters admin queue even if auto-rejected. Prevents "AI said no with no recourse" experience.

### 7.5 Publisher manual approval queue

When `requireManualApproval=true`, publisher sees:

- List of pending creatives matched to their slots.
- Preview rendered in their slot's actual sizes.
- Approve / Reject. Rejection reason optional; if provided, fed back to advertiser.

V1: only on hosted dashboard. V2: embed widget `<adplatform-approval-queue>` for editorial publishers wanting in-CMS workflow.

## 8. API & MCP Surface

### 8.1 Authentication

- Firebase ID token in `Authorization: Bearer` header for user-facing calls.
- Long-lived service-account API keys for B2B integrations (markadssetning.is as a privileged consumer).
- Widget-scoped keys (`wk_*`) for embed widgets; read-only, restricted to specific publisher/campaign.

### 8.2 REST endpoints

```
# Publishers
POST   /v1/publishers
GET    /v1/publishers/me
PATCH  /v1/publishers/me
GET    /v1/publishers/me/slots
POST   /v1/publishers/me/slots
PATCH  /v1/publishers/me/slots/{id}
GET    /v1/publishers/me/slots/{id}/snippet      # returns HTML snippet
GET    /v1/publishers/me/stats?period=30d
GET    /v1/publishers/me/pending-approvals
POST   /v1/publishers/me/approvals/{creativeId}  # body: { action: "approve"|"reject", reason? }
GET    /v1/publishers/me/payouts

# Advertisers
POST   /v1/advertisers
GET    /v1/advertisers/me
GET    /v1/advertisers/me/wallet
POST   /v1/advertisers/me/wallet/topup           # returns Blikk/Teya checkout URL
POST   /v1/creatives                             # multipart: image + metadata
GET    /v1/creatives/{id}
GET    /v1/slots/search                          # ?size=&geo=&category=&maxCpm=
POST   /v1/campaigns
PATCH  /v1/campaigns/{id}
GET    /v1/campaigns/{id}/stats

# Admin
GET    /v1/admin/review-queue
POST   /v1/admin/review/{creativeId}
GET    /v1/admin/payouts/pending
POST   /v1/admin/payouts/{id}/mark-completed

# Webhooks / internal
POST   /api/blikk/webhook                        # Blikk webhook handler
POST   /api/teya/webhook                         # Teya webhook backup handler
POST   /api/internal/aggregate-stats             # Vercel cron, hourly
POST   /api/internal/process-payouts             # Vercel cron, monthly
POST   /api/internal/push-cache                  # called on any cache-affecting mutation
```

### 8.3 MCP tools

One MCP tool per logical operation. Bilingual (IS/EN) tool descriptions.

**Publisher tools:**

- `register_publisher(domain, payout_method)`
- `list_my_slots()`
- `create_slot(name, sizes, pricing, placement)`
- `update_slot(slot_id, ...)`
- `get_snippet_code(slot_id)`
- `get_stats(period)`
- `set_content_policy(blocked_categories, require_manual_approval)`
- `list_pending_approvals()`
- `approve_creative(creative_id)`
- `reject_creative(creative_id, reason)`
- `list_payouts()`

**Advertiser tools:**

- `register_advertiser(company, kennitala, vat)`
- `get_wallet_balance()`
- `create_topup_link(amount_isk)`
- `upload_creative(image_url, click_url)`
- `search_slots(category, size, geo, max_cpm)`
- `create_campaign(name, creative_ids, slot_ids, budget, schedule)`
- `pause_campaign(campaign_id)`
- `get_campaign_stats(campaign_id)`
- `list_my_campaigns()`

**MCP resources** (read-only data subscriptions):

- `publishers://me/stats/last-30d`
- `campaigns://me/active`

### 8.4 Embed widgets

Web components, npm + CDN distribution:

- `<adplatform-stats publisher-key="pk_xxx" period="30d">`
- `<adplatform-approval-queue publisher-key="pk_xxx">`
- `<adplatform-campaign-stats campaign-id="..." viewer-key="vk_xxx">`

Authenticated with publisher/viewer keys (not Firebase tokens — those must not live in public DOM).

## 9. MVP Scope & Deployment

### 9.1 Phase 1 (~4 weeks): Friend's properties as live testbed

**In scope:**

- REST API: publisher, slot, creative, campaign CRUD; Blikk/Teya wallet top-up.
- Hosted dashboard: advertiser flow (top-up, create campaign, stats) + publisher flow (slots, stats, payout) + admin flow (review queue, payout processing).
- Snippet + serving endpoint as Vercel function with Upstash Redis cache.
- Auto-scan + admin manual review queue.
- MCP server with publisher and advertiser tools.
- Ledger with manual payout (admin executes bank transfer).
- 2-3 slot sizes deployed on friend's own websites.
- markadssetning.is consuming API via service account for human-approved campaign distribution.

**Out of scope for Phase 1:**

- Cloudflare Worker hot path (Vercel function suffices for projected traffic).
- Embed widgets.
- Automated payout via bank API.
- Canva integration (manual PNG upload only).
- Publisher manual approval workflow (Phase 1 publishers opt-out).
- VAT API integration (manual invoicing via bookkeeper or Payday draft).

### 9.2 Phase 2 (~6 weeks): Open beta

- Publisher manual approval workflow.
- Embed widgets.
- Cloudflare Worker serving migration if traffic >50k impressions/day.
- Automated payouts (using Blikk API payouts / bank claims).
- Onboard 5-10 external Icelandic publishers.

### 9.3 Phase 3: Market push

- Sales outreach to established Icelandic media.
- VAT API integration (Payday API automation for VSK and contractor payout reporting, with DK/Regla as backup).
- Canva partner-tier integration if acquired.

### 9.4 Repository structure

Monorepo (Turborepo):

```
apps/
  dashboard/        React 19 + Vite + Tailwind v4
  api/              Vercel functions (REST)
  mcp/              MCP server
  serving/          Vercel function (V1) → Cloudflare Worker (V2)
packages/
  snippet/          Built into static JS, hosted on Cloudflare CDN
  widgets/          Web components, npm + CDN distribution
  shared/           Types, Zod schemas, Firestore wrappers
```

### 9.5 Deployment topology

- Vercel: 4 projects (dashboard, api, mcp, serving) in shared organization.
- Cloudflare: CDN for snippet.js (V1); KV + Worker for serving (V2).
- Firebase: dedicated project (separate from markadssetning.is), same Firebase organization.
- Upstash Redis: hot-path cache, frequency-cap counters, budget counters.
- Blikk / Teya: account-to-account payments (Blikk API) and credit card backup (Teya Checkout API).
- Payday: automated bookkeeping and contractor tax reporting.

## 10. Parallel Prerequisites

These are out of scope for engineering but must complete before launch:

- **Legal / tax consultation** on VAT treatment of wallet + marketplace flows under Icelandic law.
- **DPA template** with publishers (we as processor, publisher as controller).
- **Privacy policy** covering snippet behavior, geo-only data, no PII storage.
- **Blikk & Teya commercial agreements** and acquiring/API credentials setup.
- **Payday API credentials setup** and bookkeeper/accountant engagement for manual oversight.

## 11. Open Questions / V2+

- Currency support beyond ISK (probably never — Icelandic market focus).
- Per-publisher fee negotiation UI.
- Real-time bidding (only if scale demands; not before).
- Native ad format.
- Cross-publisher anonymous frequency cap (cookie-less requires server-side fingerprinting; deferred).
- Canva Connect partner application.
- Sub-publisher / multi-site accounts for media groups.

## 12. Implementation Plan Order

Phase 1 is broken into nine sub-plans in `docs/superpowers/plans/`. **Execute in the order below, not in numeric filename order.** Each plan produces working, testable software on its own.

| Order | Plan file                            | Produces                                                                                                                 | Depends on       |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| 1     | `2026-06-02-01-foundation.md`        | Monorepo, shared Zod schemas, Firebase project, Firestore security rules, CI                                             | —                |
| 2     | `2026-06-02-02-publisher-core.md`    | REST API for publisher + slot CRUD, snippet code generator                                                               | 1                |
| 3     | `2026-06-02-03-snippet-serving.md`   | snippet.js, hot-path serving endpoint, Redis cache, push-on-change                                                       | 1, 2             |
| 4     | `2026-06-02-04-advertiser-core.md`   | REST API for advertiser + creative + campaign, auto-scan stub, slot search; upgrades cache push to read active creatives | 1, 2, 3          |
| 5     | `2026-06-02-05-billing-wallet.md`    | Ledger, wallet service, Blikk/Teya checkout + webhook, CPM accrual cron                                                  | 1, 2, 4          |
| 6     | `2026-06-02-06-approval-workflow.md` | Admin review queue, publisher manual approval, appeal flow                                                               | 1, 2, 4, 5       |
| 7     | `2026-06-02-09-payouts-stats.md`     | Stats aggregation cron, campaign stats endpoint, monthly payouts cron, snippet CDN deploy, E2E smoke test                | 1, 2, 4, 5       |
| 8     | `2026-06-02-07-hosted-dashboard.md`  | React 19 dashboard for advertiser, publisher, admin surfaces                                                             | 1, 2, 4, 5, 6, 7 |
| 9     | `2026-06-02-08-mcp-server.md`        | MCP server with 19 tools (publisher + advertiser), service-account API keys                                              | 1, 2, 4, 5, 6    |

**Why this order (not numeric filename order):**

- **#9 plan-file (payouts/stats) runs at position 7** because the dashboard (plan-file #7) consumes stats and payout endpoints introduced there.
- **#7 plan-file (dashboard) runs at position 8** so all backend surfaces it queries exist first.
- **#8 plan-file (MCP) runs last** because it is a thin wrapper over the REST API and can be added without touching dashboard work.

**Parallelization opportunities:**

- After plan 1 (Foundation) is merged, plans **2+3** and **4+5** can be developed in parallel git worktrees — they touch disjoint services.
- Plan 6 (Approval) requires 4+5 merged before starting.
- Plan 8 (Dashboard) and plan 9 (MCP) can be developed in parallel once the API surfaces from plans 1–6 + position-7 are merged.

**Recommended Antigravity workflow:**

1. Open the `ada/` folder in Antigravity.
2. Point the agent at `docs/superpowers/specs/` and `docs/superpowers/plans/` for context.
3. Start with: _"Read `docs/superpowers/plans/2026-06-02-01-foundation.md` and execute task-by-task using the superpowers:subagent-driven-development workflow. Pause after each task for human verification."_
4. After each plan completes, run the verification commands at the end of that plan, then start the next plan in the order above.

**Launch-blocking parallel prerequisites** (not engineering tasks — start in parallel with plan 1):

- Legal/VAT consultation under Icelandic law
- DPA template for publishers (we = processor, publisher = controller)
- Privacy policy covering snippet behavior
- Blikk and Teya commercial agreements and API setup
- Payday account/API setup and bookkeeper engagement for VSK oversight
- Confirmed first publishers (friend's own sites for Phase 1)

## 13. Non-Goals

- Behavioral targeting based on user profiles.
- Cross-site tracking cookies.
- Third-party data integrations (data brokers, audience providers).
- Cryptocurrency or alternative payment rails.
- White-label resale to other markets.
