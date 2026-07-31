# Wayfinder Map: Ensk Lendingarsíða & Biðlistasöfnun (Global English Landing & Waitlist)

`wayfinder:map`

## Destination

Gæða ensk lendingarsíða (`/en`) í `apps/dashboard` ásamt tvíþættri biðlistasöfnun (Advertisers & Publishers), fullkominni SEO/Geo/LLMO bjartsýni (JSON-LD, OpenGraph, static HTML prerender), og öruggri bakenda-skráningu í Firestore (`waitlist`) til að kanna alþjóðlegan áhuga (_demand testing_).

## Notes

- **Stutt samantekt virkni:** Enskur kynningarflötur fyrir Birtingur category network mótsviðið.
- **Tæknilegir innviðir:** React 19 + Tailwind 4 Nordic Editorial einingar í `apps/dashboard`, Hono API leið `POST /v1/waitlist` í `apps/api`, og Playwright static prerender snapshot pipeline.
- **Tungumál:** 100% vönduð enska á lendingarsíðunni, en íslenska í innri ákvarðanamiðum.

## Decisions so far

- [001: Monorepo Subsystems & Dependency Graph](tickets/001-monorepo-subsystems.md) — Stofnpakkinn stýrir týpum og converters.
- [002: Data Ledger & Financial Audit](tickets/002-data-ledger-financials.md) — Firestore ledger og committed funds.
- [003: Ad Serving Hot-Path & Privacy Contract](tickets/003-ad-serving-hotpath.md) — Cookie-free serving og HMAC undirskriftir.
- [004: MCP Agentic Buying & Safety Limits](tickets/004-mcp-agentic-buying.md) — Öryggismörk MCP gervigreindarkaupa.
- [005: Nordic Editorial UI & Prerender Pipeline](tickets/005-nordic-editorial-ui.md) — Nordic Editorial hönnunarkerfi og Playwright HTML prerender.
- [006: Local Launch Security & Rules Audit](tickets/006-security-rules-audit.md) — Öryggi Firestore reglna og auth scopes.
- [007: Icelandic Ad Fraud & Impression Quality](tickets/007-local-fraud-detection.md) — HMAC undirskriftir og IAB viewability.
- [008: English Landing Value Proposition & Copy](tickets/008-english-landing-value-prop.md) — Söluskilaboð og gildistillaga stillt af fyrir lág-núnings áhagamælingu (_demand testing / waitlist_) fyrir alþjóðlega bloggara og auglýsendur.
- [009: Waitlist Schema & API Gating](tickets/009-waitlist-data-schema-api.md) — Firestore `waitlist` gagnagrind, Zod validering í `@ada/shared` og opin REST API leið `POST /v1/waitlist` í `apps/api`.
- [010: English Landing UI Prototype](tickets/010-english-landing-ui-prototype.md) — Ensk viðmótssíða `/en` byggð í `apps/dashboard` með Nordic Editorial einingum og gagnvirku biðlistaformi.
- [011: SEO, GEO & Structured Data Optimization](tickets/011-seo-geo-llmo-prerender.md) — JSON-LD Structured Data, canonical metatög og `sitemap.xml` skráning fyrir Playwright HTML prerender snapshots.

## Frontier & Active Decision Tickets

- [012: English SEO Content Clusters & Category Landing Pages](tickets/012-llm-geo-landing-pages-content.md) — `wayfinder:task` — Útfærsla á leitarorðastefnu með enskum fræðslugreinum (`/en/guides/*`) og flokkasíðum (`/en/categories/*`).
- [013: Waitlist Email Confirmation & Telemetry](tickets/013-waitlist-telemetry-email-welcome.md) — `wayfinder:task` — Sjálfvirkur velkomins-tölvupóstur á ensku via Resend og biðlistatölfræði í stjórnborði stjórnenda.

## Not yet specified

<!-- Fog of war: Innan ramma verkefnisins en ekki komið á miðastig enn -->

- Mælingar á alþjóðlegri traffík (_Analytics & Attribution_) til að greina hvaða lönd sýna mestan áhuga.

## Out of scope

<!-- Ákvarðanir eða hugmyndir sem hafa verið útilokaðar -->

- Bein alþjóðleg kortafærslutaka á ensku síðunni (aðeins biðlisti í þessum fasa).
