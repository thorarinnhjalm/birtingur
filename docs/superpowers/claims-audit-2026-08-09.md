# Pre-launch claims audit — public marketing surfaces, 2026-08-09

Scope: the live copy actually served to the public, fetched over the network
from `www.birtingur.app` rather than read out of source — `/`, `/auglysendur`,
`/midlar`, `/faq`, `/en`, plus `public/llms.txt` and the `index.html` crawler
fallback. Each claim is checked against code, constants, tests or a live probe.

Reference for what is permitted: the verified USP list in `AGENTS.md`.

## BLOCK — false as written

### 1. "Stofnaðu herferð á 3 mínútum" — `apps/dashboard/index.html:63`

Live on the homepage right now. Two separate problems.

It is a **banned pattern**. `AGENTS.md` bans time promises outright
("less than 2 minutes", "3-minute signup"). This is one.

It is also **factually false today**. The `/auglysendur` page carries its own
banner saying advertiser registration is not open yet: _"Skráning nýrra
auglýsenda opnar fljótlega – smelltu hér til að skrá þig á biðlista"_. Nobody
can create a campaign in three minutes, because nobody can create one at all.
The homepage promises a speed for a door that is shut.

Two guardrail gaps let it through, and both need fixing or it comes back:

- `scripts/check-marketing-claims.mjs` scans `src/pages/English*.tsx`,
  `public/llms.txt` and `prerender/snapshots.json`. It **never reads
  `index.html`**. That file is the static fallback inside `#root`, served to
  every non-JS crawler and LLM — the first Birtingur text they see — and no
  check has ever looked at it.
- Even if it were scanned, the Icelandic branch of the time-promise regex is
  `\d+.(mínút|sekúnd)\w* (skráning|uppsetning)`, which requires the words
  "skráning" or "uppsetning" to follow. Verified against the live string:
  no match. The English branches are English-only.

_Fix:_ remove the time promise from the fallback copy, add `index.html` to the
scanned set, and loosen the Icelandic pattern to catch a bare
`\d+ mínút\w*` near a verb of doing.

### 2. "Settu upp einn stuttan kóðabút og byrjaðu að fá borgað" — `/midlar`

True only once PR #21 is merged and deployed. Every embed snippet the product
hands out pointed at hostnames that serve nothing (`cdn.birtingur.app`,
`cdn.birtingur.is`, `serve.adplatform.is`), so a publisher who followed this
instruction got a permanently dead embed and no error explaining it. PR #20
fixed the snippet's own build target; #21 fixes the seven places the embed
strings are generated. Until #21 ships, this page describes something that
cannot work.

_Status:_ not a copy defect — the copy becomes true when the fix deploys. Do
not soften it; ship #21.

## STALE / overstated

- **"Birtingur is expanding its MCP-native & privacy-first ad network
  globally"** (`/en` banner). "Expanding" describes an operating network being
  extended. `AGENTS.md` is explicit that the network is pre-launch with a
  waitlist and must be framed as being built. The Icelandic side already does
  this honestly; the English side does not.
- **"Explore Active Content Categories"** (`/en`). "Active" implies live
  inventory in those five categories. There is no serving publisher yet.
  "Content categories" alone carries the same meaning without the claim.
- **"Lágmarksútborgun er aðeins 10,000 kr."** (`/midlar`). The figure is
  correct; the separator is not. Icelandic writes `10.000`. Cosmetic, but it
  is a money figure on a money page.

## UNVERIFIABLE

- **"án dýrra milliliða eða auglýsingastofa"** (`index.html`, homepage). An
  implicit cost comparison against agencies with no source. Defensible as a
  description of the model rather than a benchmark, but it is the kind of
  phrasing the 2026-07 truthfulness pass was about. Either keep it as a
  structural statement ("engir milliliðir") or be ready to back "dýrra".

## RISKY — owner must confirm, not Claude

- The **GDPR / ePrivacy guide** (`/en/guides/privacy-first-display-ads-gdpr`)
  was not read line by line in this pass. Compliance framing is the one
  category Claude must not validate. It needs its own read against the
  "educational framing only" rule.

## VERIFIED

| Claim                                       | Checked against                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Flat 550 kr. CPM                            | `FLAT_CPM_ISK = 550`, `packages/shared/src/constants.ts:78`                                                                           |
| Creators keep 80%                           | `DEFAULT_PLATFORM_FEE_PERCENT = 20`, same file line 2                                                                                 |
| Minimum payout 10.000 kr.                   | `MIN_PAYOUT_ISK = 10000`, line 5                                                                                                      |
| VAT 24%                                     | `VAT_RATE = 0.24`, line 72                                                                                                            |
| "100% Cookie-Free", no cross-site profiling | serving sets no cookies; `apps/serving/tests/ad-route.test.ts:226,232` assert `set-cookie` is null on both the fill and no-fill paths |
| Stats update hourly (never "real-time")     | `cron-aggregate` runs hourly; copy uses "hourly" throughout                                                                           |
| MCP server at `mcp.birtingur.app`           | live; all twelve tools named in `llms.txt` exist under `apps/mcp/src/tools/`                                                          |
| schema.org `sameAs` GitHub link             | `thorarinnhjalm/birtingur` is public, so the link resolves                                                                            |
| Advertiser signup framed as not-yet-open    | `/auglysendur` banner states it plainly                                                                                               |

## Process finding

The claims guardrail's coverage is narrower than it reads. Icelandic marketing
pages are only checked _indirectly_, through `prerender/snapshots.json` — so
they are protected exactly as well as the snapshots are fresh, and the AGENTS.md
recapture rule is the only thing keeping that true. `index.html` is outside the
net entirely. The banned-pattern list is also markedly stronger in English than
in Icelandic, on a site whose primary language is Icelandic.
