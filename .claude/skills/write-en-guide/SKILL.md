---
name: write-en-guide
description: Use when writing or editing an English guide article for birtingur.app/en, adding entries to the ARTICLES map in EnglishGuidePage.tsx, or editing any /en marketing copy (landing, category pages, llms.txt). Also use when asked to "write a guide", "add an article", or produce SEO/GEO content for the English site.
---

# Writing English Guide Articles for birtingur.app/en

## Overview

Guide articles are public marketing copy. Every factual claim must come from
the verified USP list in `AGENTS.md` — nothing else. The mechanical checker
catches banned phrases, but the four violations that actually shipped to
production (2026-08-01 audit) were all judgment calls the regex cannot see.
This skill exists to stop those.

**Read `AGENTS.md` in full before drafting. It is the authority; this skill
is the workflow around it.**

## The article contract

New articles are entries in `ARTICLES` in
`apps/dashboard/src/pages/EnglishGuidePage.tsx`:

- `slug` — kebab-case, keyword-bearing, matches the map key
- `category` — one of the union: `'AI & MCP' | 'Creator Monetization' | 'Privacy & Compliance' | 'Category Playbooks'`
- `title`, `subtitle`, `description` (meta description), `date`, `readTime`
- `sections` — exactly the `{h2, p}[]` shape, typically 3 sections

The overview page and routes pick the article up automatically from the map.
Everything else is manual — see the wiring checklist.

## Claims: what you may say, with sources

| Claim                                                                            | Source of truth                                      |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Flat 550 kr. CPM, same for every category                                        | `FLAT_CPM_ISK` in `packages/shared/src/constants.ts` |
| Creators keep 80% of net (80/20 split)                                           | `DEFAULT_PLATFORM_FEE_PERCENT = 20`                  |
| Monthly payouts, minimum 5.000 kr., by bank transfer                             | `MIN_PAYOUT_ISK = 5000`; `cron-payouts`              |
| Stats/analytics updated hourly — never "real-time"                               | `cron-aggregate` hourly                              |
| Serving sets zero cookies; first-party visitor id is consent-gated               | `tests/ad-route.test.ts` asserts it                  |
| Impressions counted after IAB viewability delay                                  | snippet `render.ts`                                  |
| Snippet under 5KB                                                                | `packages/snippet/dist/snippet.js` (~3.1KB)          |
| MCP server at mcp.birtingur.app with the tools listed in AGENTS.md               | `apps/mcp/src/tools/`                                |
| Agentic purchases: opt-in per key, monthly cap, `autoApproveLimitIsk` human gate | `services/api-keys.ts`                               |

Category names in English use the official mapping in `EnglishLanding.tsx`
(e.g. matur → "Food & Culinary", taekni → "Tech & Innovation") — do not
invent new English category names.

## Traps that shipped to production — never repeat these

These were written by agents that had AGENTS.md available. Each is banned:

| What was written                                                                                      | Why it's wrong                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "In seconds, their application receives … and start earning revenue" (about MCP `register_publisher`) | Time promise + zero-touch onboarding. Every MCP call requires an `ak_` key a human created in the dashboard first. Always state that prerequisite when describing MCP flows.                |
| "payouts directly to the developer's wallet"                                                          | Publishers have no wallet — wallets are an advertiser concept. Payouts are monthly bank transfers, min 5.000 kr.                                                                            |
| "Mediavine and Ezoic … load dozens of third-party tracking scripts"                                   | Named-competitor accusation with a figure. Attribute defects to unnamed "traditional ad networks"; keep only publicly documented facts (e.g. traffic minimums) next to a competitor's name. |
| "brand signals that feed directly into LLM RAG pipelines" / "AI crawlers associate your brand…"       | Ads are injected client-side; AI crawlers mostly don't execute JS. GEO benefit claims must be framed as emerging/educational ("may"), never as fact or mechanism.                           |

Also from the same audit: JSON-LD `datePublished` is a single hardcoded
constant in `EnglishGuidePage.tsx` — when adding articles with a different
publish date, make it per-article.

## Workflow

1. **Read `AGENTS.md`** (claims policy + MCP facts + prerender rule).
2. **Draft** the article in the ARTICLES shape. Optional aids:
   `marketing:draft-content` for structure/SEO, `marketing:brand-review`
   for voice. Their output is still subject to the claims policy.
3. **Self-review every sentence** against the USP table and traps table
   above. A claim not in the table gets deleted or sourced.
4. **Run the mechanical checker** — necessary but NOT sufficient (it missed
   all four production traps):

   ```bash
   node apps/dashboard/scripts/check-marketing-claims.mjs
   ```

5. **Run the `pre-launch-claims-audit` skill** as the final gate before
   commit. It verifies claims against the codebase, not just against regex.
6. **Wire it in** (checklist below), then build + recapture prerender.

## Wiring checklist for a new article

- [ ] Entry in `ARTICLES` map (`EnglishGuidePage.tsx`) — overview page and
      route are automatic
- [ ] URL added to `apps/dashboard/public/sitemap.xml` (sitemap is the
      prerender route source of truth)
- [ ] URL added to `apps/dashboard/public/llms.txt`
- [ ] `pnpm --filter @ada/dashboard build`
- [ ] `pnpm --filter @ada/dashboard prerender:capture`
- [ ] Commit updated `prerender/snapshots.json` **in the same change** —
      copy that skips this never reaches crawlers
- [ ] `pnpm verify` passes (runs the claims checker via lint)

## Red flags — stop and re-check the claims table

- Any duration or speed promise ("in seconds", "instantly", "2 minutes")
- "wallet" in a publisher/creator context
- A competitor's name in the same sentence as a number or an accusation
- Any sentence explaining _how_ AI engines will reward buying Birtingur ads
- "real-time", "guaranteed", "fastest", invented scale numbers
- Describing MCP onboarding without mentioning the human-created API key
