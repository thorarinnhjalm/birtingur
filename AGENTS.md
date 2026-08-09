# Agent rules for this repository

Full codebase documentation lives in `CLAUDE.md` — read it. This file exists
because marketing-claims violations have been reintroduced repeatedly by
agents that never loaded that context. The rules below are non-negotiable
for ANY agent writing public-facing copy (landing pages, guide articles,
llms.txt, emails, prerender snapshots).

## Marketing claims policy (hard rule)

Public copy may claim ONLY the verified USP list:

- Flat 550 kr. CPM — the same price for every category (never "high-CPM",
  never per-category pricing tiers)
- Category-based buying (no slot/site picking)
- No third-party cookies; serving sets no cookies at all
- 80/20 revenue split (creators keep 80% of net)
- Monthly payouts, minimum 10.000 kr.
- Viewability-counted impressions (IAB delay before the pixel fires)
- Stats/analytics updated hourly — NEVER "real-time" / "rauntíma"
- An MCP server exists (mcp.birtingur.app) with publisher and advertiser
  tools; agentic purchases are opt-in per API key with hard money guardrails

Banned everywhere in public copy:

- "real-time", "rauntíma", "instant(ly)", "guarantee(d)", "fastest", "No. 1"
- Time promises ("less than 2 minutes", "3-minute signup")
- Claims that anyone is "switching from" competitors — the network is
  pre-launch with a waitlist; frame it as being built
- Invented scale numbers ("500+ publishers", "50,000+ sessions")
- Legal/compliance promises (GDPR "no consent needed" etc.) — educational
  framing only; note the snippet's visitor id is itself consent-gated
- Named-competitor accusations with specific figures

Enforcement is mechanical: `apps/dashboard/scripts/check-marketing-claims.mjs`
runs as part of `pnpm --filter @ada/dashboard lint` (and therefore
`pnpm verify` and the pre-push hook) and fails on banned patterns in the
English marketing pages and in `prerender/snapshots.json`. Do not delete,
weaken, or bypass this check to make a build pass — fix the copy instead.

## Prerender rule

Marketing routes are served to crawlers from the committed
`apps/dashboard/prerender/snapshots.json`. Whenever you change marketing
copy, a marketing page, or `public/sitemap.xml`, you MUST rebuild and
recapture before committing:

```bash
pnpm --filter @ada/dashboard build
pnpm --filter @ada/dashboard prerender:capture
```

and commit the updated `snapshots.json` in the same change. Copy edits
that skip this step never reach crawlers.

## MCP facts (when marketing the MCP server)

- Publisher tools: `register_publisher`, `create_slot`, `update_slot`,
  `list_slots`, `get_snippet`, `get_react_component`, `get_stats`,
  `set_content_policy`, `get_changelog`
- Advertiser tools: `list_categories`, `create_campaign`, `get_campaign`,
  `list_campaigns`, `list_creatives`, `get_wallet`
- Registration is NOT self-serve for agents: every MCP call requires an
  `ak_` API key created by a human in the dashboard first. Never advertise
  "instant registration" or zero-touch agent onboarding.
- Purchases via API key require opt-in (`purchase.enabled`), respect a
  monthly cap, and above `autoApproveLimitIsk` await human approval.
  Top-ups and refunds are dashboard-only. Describe these guardrails
  accurately — they are a feature, not a limitation to hide.
