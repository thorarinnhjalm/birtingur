# Bot traffic: measure first, then stop billing for it

**Date:** 2026-08-09
**Status:** Approved design. Phase 1 ready to implement; Phase 2 gated on Phase 1's data.

## Problem

There is no bot filtering anywhere in `apps/serving` — verified: not a single
user-agent, crawler or headless check exists in the whole app. Every request
that reaches `/v1/ad` is treated as a person.

Two consequences, of different severity.

**Traffic numbers.** The page-view figure (`/v1/pageview`, shipped 2026-08-09)
has no viewability requirement — it is recorded the moment the signed pixel
fires. Any crawler that executes JavaScript is counted in full as a visit to
the publisher's site.

**Money.** This is the part that matters. Impressions are protected by the
IAB viewability gate (50% visible for 1 continuous second, enforced through
`IntersectionObserver` in `packages/snippet/src/render.ts`), which does drop
simple crawlers that never render. But headless Chrome runs
`IntersectionObserver` exactly like a real browser. So an unknown share of the
impressions **advertisers are charged for** may be machines. At a flat 550 kr
CPM, every 1.000 bot impressions is 550 kr an advertiser paid for nobody
seeing an ad, and 440 kr credited to a publisher for the same nothing.

Nobody knows the size of that share, and that is the actual problem: we cannot
design a filter for a quantity we have never measured.

## Owner decisions (2026-08-09)

- **If bots turn out to be a meaningful share of paid impressions, stop
  charging for them** — the advertiser pays for humans, and the publisher's
  credit drops correspondingly. Honest over lucrative.
- **Classification stays light and data-free**: user-agent patterns for known
  crawlers plus simple headless signals. No new personal data about visitors,
  no behavioural fingerprinting, no third-party bot-detection service, no
  added latency on the serving hot path.

The second decision constrains the first: a light classifier is high-precision
on _known_ bots and only suggestive on the rest, so only the confident class
may ever affect money. See "What may affect billing" below.

## Phase 1 — Measure, change nothing

The whole point is to produce a number without touching a single figure anyone
currently sees or is billed for.

### Classification

A new pure module in serving classifies each request into one of three
classes from headers alone — no I/O, no state, nothing that can fail:

```
type BotClass = 'human' | 'known_bot' | 'suspected_bot';
classifyRequest(headers): BotClass
```

- **`known_bot`** — the user-agent matches a maintained pattern list of
  declared crawlers (search engines, SEO tools, AI crawlers, link
  unfurlers: Googlebot, bingbot, DuckDuckBot, AhrefsBot, SemrushBot,
  GPTBot, ClaudeBot, PerplexityBot, facebookexternalhit, Twitterbot,
  Slackbot, and similar). These self-identify; matching them is reliable.
- **`suspected_bot`** — does not self-identify but shows a headless or
  malformed-client signal: `HeadlessChrome`/`PhantomJS`/`Puppeteer` in the
  UA, a missing `Accept-Language` on a browser-shaped UA, or an absent
  user-agent entirely.
- **`human`** — everything else. The default, deliberately: an unrecognised
  client is a person until proven otherwise.

The pattern list lives in one file with a comment explaining that it is
maintained by hand and is expected to be incomplete — it is a floor on
what we can detect, never a claim of completeness.

### Recording

- `AdEvent` gains `botClass`. Each serving route that logs an event
  classifies its own request (the impression pixel and the page-view pixel
  are separate HTTP requests from the same browser and each carry their own
  headers).
- The aggregator writes per-class counts **alongside** the existing totals,
  as nested objects — never dot-path keys (`batch.set(..., {merge:true})`
  does not split them; that bug silently killed the byPublisher breakdown
  for months, fixed 2026-08-08).
- Existing fields keep their exact current meaning and value. Impressions
  still bill, page views still display, fill rate is untouched.

### Reporting

The share is reported where the owner already looks at system state, not on
publisher- or advertiser-facing screens: `/api/cron-diagnostics` gains a
rolling summary (last 7 days: impressions and page views by class, in
absolute numbers and as a percentage), and the admin overview shows the same
figures. No publisher and no advertiser sees anything new in Phase 1.

### Duration and exit criterion

Run for **two to four weeks**, long enough to cover weekday/weekend and at
least one crawl cycle of the major search engines. Phase 2 begins when the
owner reads the numbers, not on a timer.

## Phase 2 — Stop billing for bots (gated on Phase 1's data)

The direction is already decided; only the magnitude and the exact threshold
wait on data. When it runs:

### What may affect billing

**Only `known_bot`.** Declared crawlers are identified by their own
self-description, so a false positive is rare and, when it happens, means a
crawler lied about being a crawler. `suspected_bot` never affects money on
its own evidence — a misclassified human costs the publisher a real credit
and the advertiser a real delivery, and a heuristic is not good enough to do
that. If Phase 1's data shows `suspected_bot` is both large and clearly
machine-shaped, that becomes its own decision with its own review.

### Mechanism

- `logEvent` routes `known_bot` impressions to the stats queue only, never
  to `events:accrual`. Nothing is charged and nothing is credited — the same
  shape as today's fallback/house-ad handling, which already reaches stats
  but not billing.
- Stats keep recording them under their own class, so the volume stays
  visible rather than disappearing.
- Publisher-facing traffic and fill rate exclude `known_bot`.
- Advertiser-facing campaign stats exclude them too, so impressions shown
  and impressions charged stay equal — the invariant that makes the numbers
  checkable.

### Consequences to state plainly when it ships

Both sides' numbers drop. The publisher's traffic and earnings fall by the
bot share; the advertiser's delivered impressions fall by the same events
they are no longer charged for. That is the point, but it must be said in
the release rather than discovered.

## Non-goals

- No third-party bot-detection service, no behavioural fingerprinting, no
  mouse/dwell telemetry (owner decision).
- No blocking: a classified bot still receives an ad response. We are
  changing what we count and charge, not who we serve.
- No public marketing claim about bot filtering. The claims guardrail
  (`AGENTS.md`, `check-marketing-claims.mjs`) applies — nothing goes into
  public copy until Phase 2 has shipped and the figure is verifiable.

## Error handling

Classification is pure and total: any unexpected header shape falls through
to `'human'`, the safe default. It cannot throw, cannot block a response, and
adds no I/O to the hot path.

## Testing

- Classifier: a table of real user-agent strings — major crawlers, AI
  crawlers, headless Chrome, ordinary desktop and mobile browsers, empty and
  malformed UAs — each asserted to its expected class. This table is the
  contract; it is where a future disagreement about a pattern gets settled.
- Serving: each event-logging route stamps the class it computed.
- Aggregator: per-class counts land as real nested fields (read the
  persisted document back), and existing totals are byte-for-byte unchanged
  by the addition.
- Phase 2, when it runs: a `known_bot` impression reaches `events:stats` and
  NOT `events:accrual`; a `human` impression reaches both; publisher and
  advertiser figures exclude the bot class consistently.

## Rollout

- Phase 1 is one PR, additive and invisible to users. It cannot change a
  number anyone sees — that is the acceptance criterion.
- Phase 2 is a separate PR after the owner has read the data, and its
  release note must state the expected drop on both sides.
