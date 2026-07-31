# Wayfinder Map: Birtingur (`ada`) Kerfisáætlun & Ákvarðanakort

`wayfinder:map`

## Destination

Ítarleg og heildstæð kerfisúttekt og ákvarðanakort fyrir **Birtingur (`ada`)** dreift kerfið á Íslandi — sem nær yfir alla 7 pakka/öpp (`shared`, `api`, `serving`, `dashboard`, `mcp`, `snippet`, `widgets`), öryggismörk, fimm crons, fjárhagslóga/bókhald og sjóðheita ræsingu á íslenskum markaði.

## Notes

- **Kóðagrunnur:** Turborepo + pnpm monorepo.
- **Markaður & Fókus:** Ísland (long-tail niche creators, t.d. matar-/lfsstílsbloggarar og íslensk lítil/meðalstór fyrirtæki).
- **Kjarnatækni:** Hono REST API, Redis (Upstash) hot-path cache, Firestore database, React 19 + Vite dashboard, MCP server (`@modelcontextprotocol/sdk`).
- **Gjaldmiðill & Skattar:** ISK (heilar krónur), VSK 24%, birtingargjald (FLAT_CPM_ISK), 20% vettvangsþóknun.
- **Tungumál skjala:** Íslenska í öllum notenda- og kerfisútskýringum, enska í kóða og heiti miða.

## Decisions so far

- [001: Monorepo Subsystems & Dependency Graph](tickets/001-monorepo-subsystems.md) — Stofnpakkinn (`@ada/shared`) stýrir öllum týpum, Zod skemum og Firestore converters; turbo byggingarröð og `pnpm verify` koma í veg fyrir samþættingarbrot þvert á 7 vinnusvæði.
- [002: Data Ledger & Financial Audit](tickets/002-data-ledger-financials.md) — Append-only Firestore færslubók er uppspretta sannleikans; committed-funds frátaka og `cron-reconcile` tryggja 100% money-conservation.
- [003: Ad Serving Hot-Path & Privacy Contract](tickets/003-ad-serving-hotpath.md) — Hot-path í `apps/serving` er 100% cookie-free, notar Redis in-memory selection og HMAC pixel slóðir.
- [004: MCP Agentic Buying & Safety Limits](tickets/004-mcp-agentic-buying.md) — Öryggismörk MCP gervigreindarkaupa tryggja opt-in leyfi, mánaðarþök, samþykkisgáttir og idempotency.
- [005: Nordic Editorial UI & Prerender Pipeline](tickets/005-nordic-editorial-ui.md) — Hönnunarkerfið notar Nordic-editorial einingar og Tailwind 4 þema, og SEO fæst með Playwright HTML snapshot prerender pipeline (`prerender:capture` -> `prerender:apply`).
- [006: Local Launch Security & Rules Audit](tickets/006-security-rules-audit.md) — Firestore reglur banna öll bein client-skrif (`allow write: if false;`), krefjast staðfests netfangs (`email_verified`), og `requireScope` / `rejectApiKeyMutation` koma í veg fyrir breytingar API lykla.
- [007: Icelandic Ad Fraud & Impression Quality](tickets/007-local-fraud-detection.md) — HMAC undirskriftir koma í veg fyrir fölsun birtinga, 30s deduping vinnur gegn tvísmellum, rate limits takmarka IP traffík (max 30 birtingar/h, 3 smellir/h), og IAB viewability observer tryggir að aðeins raunsýnilegar auglýsingar gjaldfærist.

## Frontier & Active Decision Tickets

_(Allir 7 ákvarðanamiðarnir á jaðrinum hafa verið leystir og samþykktir!)_

## Not yet specified

<!-- Fog of war: Innan ramma verkefnisins en ekki komið á miðastig enn -->

- Upplifun og onboarding flæði fyrir íslenska ör-útgefendur (t.d. matarbloggara).
- Prófanir á Payday/Blikk bókhalds- og reikningaútsendingum fyrir íslensk fyrirtæki.

## Out of scope

<!-- Ákvarðanir eða hugmyndir sem hafa verið útilokaðar -->

- **Alþjóðavæðing & erlendir gjaldmiðlar:** Birtingur er 100% sérsniðinn fyrir íslenska markaðinn (ISK, VSK 24%, íslenskir bloggarar) — allur stuðningur við erlenda gjaldmiðla eða svæði situr utan ramma.
- Samþætting við erlendar auglýsingaveitur (Google AdSense / Rubicon / AppNexus SSP) — Birtingur er eingöngu beinn flötur fyrir íslenska ör-útgefendur.
