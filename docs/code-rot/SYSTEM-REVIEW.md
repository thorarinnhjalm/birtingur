# Heildarúttekt á kerfinu (Birtingur) — 2026-06-05

> Ítarleg yfirferð á öllu kerfinu: arkitektúr, gagnagrunnur/gagnamódel, gagnaflæði,
> hver hluti fyrir sig, þverlæg kerfi og heilsa/áhætta. Hugsað sem grunnur fyrir
> verkflæðið: **Gemini útfærir, skilar reporti, Claude fer yfir.**
> Sjá [DIAGNOSIS.md](DIAGNOSIS.md) fyrir afmörkuðu „code-rot" atriðin með lagfæringartillögum;
> þessi skýrsla er breiðari og setur þau í samhengi.

---

## 1. Heildaryfirlit

Birtingur er sjálfsafgreiðslu-auglýsingavettvangur fyrir íslenska markaðinn, miðaður á
**langhala-efnishöfunda** (matar-/lífsstílsblogg o.þ.h.), ekki premium-miðla. Kjarnamódelið
(nýlega innleitt): útgefandi skráir vef + **flokka**, auglýsandi kaupir **flokk + budget**,
og kerfið dreifir birtingum á alla vefi í þeim flokki. Allt í **ISK** (heiltölur), VSK 24%.

**Núverandi þroskastig:** virk vara í demo (engir raunnotendur/peningar). Stór „category
network buying" breyting var innleidd 04.06 og fylgt eftir með fjölda hraðfixa 05.06 — sumir
þeirra eru plástrar sem fela rót (sjá §8). Greiðslukerfi (Teya/Payday/Blikk) eru **í bið**.

---

## 2. Arkitektúr & deploy

**Turborepo + pnpm monorepo, 7 workspaces.** `@ada/shared` er rótin sem allt annað byggir á.

| Workspace | Hlutverk | Keyrsla |
|-----------|----------|---------|
| `packages/shared` | Sannleiksuppspretta: Zod-schema, týpur, Firestore-collections + converters, fastar (`constants.ts`), ISK/dagsetn.-format | tsc lib |
| `apps/api` | Control-plane REST (Hono), `/v1/*` + cron-föll | Vercel Node functions |
| `apps/serving` | Heit leið: ad/impression/click, Redis-cache, lág seinkun | Vercel (V2: Cloudflare) |
| `apps/dashboard` | React 19 + Vite SPA, hlutverk: advertiser/publisher/admin | Vercel static + SPA-rewrite |
| `apps/mcp` | **Publisher-only** AI-tengi (slot-stjórnun, snippet, policy, approvals, stats) | Vercel, talar við API yfir HTTP |
| `packages/snippet` | `<script>` sem útgefendur embed-a (esbuild, size-budget) | CDN |
| `packages/widgets` | Browser-widget artifacts (esbuild) | CDN |

**Deploy-topology:** hver `apps/*` er sér Vercel-verkefni. API rewrite-ar allt á `api/index`
auk þriggja sjálfstæðra cron-falla. Vercel-function entrypoints (`apps/api/api/*.js`) eru
committaður JS sem importar úr `dist/` — viljandi (ekki breyta í TS).

**Athugasemd (K1, lagað):** dashboard SPA-routing var óstöðug vegna ógildrar `routes`+`cleanUrls`
blöndu í `vercel.json`; lagað á `fix/code-rot-pass-1`.

---

## 3. Gagnagrunnurinn & gagnamódelið

**Firestore (firebase-admin), 8 top-level collections** (`packages/shared/src/firestore/collections.ts`):
`publishers, slots, advertisers, creatives, campaigns, ledger, payouts, stats`.
Allar með typed Zod-converters. Emulator-skipti sjálfvirk þegar `FIRESTORE_EMULATOR_HOST` er sett.

### Kjarna-entítet og vensl

```
Publisher (1) ──< Slot (n)                 Advertiser (1) ──< Creative (n)
   │ categories[]                                │              └─ reviewStatus, autoScanResult
   │ payoutMethod, contentPolicy                 │ walletBalanceIsk (mirror)
   │                                             └─< Campaign (n)
   │                                                  ├─ targeting.categories[]   ← tengir við Publisher.categories
   │                                                  ├─ budget {mode,totalIsk,remainingIsk}
   │                                                  └─ creativeIds[]
   └────────── (flokka-skörun ræður birtingu) ───────────────────┘

Ledger (append-only)         Payout (mánaðarlega)        Stats (stigveldi)
  party{type,id}, type,        publisherId, gross/fee/      stats/publishers/{id}/{YYYYMMDD}
  amountIsk (±), relatedId      net/vatIsk, status           stats/{campaignId}/hourly/{YYYYMMDDHH}
```

### Lykilatriði í módelinu

- **Flokkur er á útgefanda** (`Publisher.categories`, 1..n úr `AD_CATEGORIES`), slot erfa.
  `Campaign.targeting.categories` matar við þá við cache-byggingu.
- **Peningar = append-only ledger.** `LedgerEntry` hefur strangar reglur: topup/credit/refund/fee
  jákvæð, charge/payout neikvæð (`schemas/ledger.ts` refine). `Advertiser.walletBalanceIsk` er
  **afrit (mirror)** af ledger-summu — tvöföld geymsla sem þarf að haldast í takt (`wallet.ts:syncMirror`).
- **Verð:** `PricingSchema` styður `cpm` og `slot` (tíma-leigu). CPM er læst server-side á
  `FLAT_CPM_ISK` (550) við slot-stofnun.
- **Geymsla utan COLLECTIONS:** API-lyklar (`ak_`) og widget-lyklar eru geymdir (services
  `api-keys.ts`/`widget-keys.ts`) en **eru ekki í `COLLECTIONS`-fastanum** — ósamræmi sem vert
  er að laga svo collection-nöfn séu öll á einum stað.

---

## 4. Gagnaflæði enda-í-enda

**Útgefandi:** skráir vef → auto-scan/classifier giskar á flokk → útgefandi staðfestir flokka →
stofnar slot (CPM læst 550) → fær embed-snippet. (Gegnum dashboard **eða** MCP.)

**Auglýsandi:** stofnar aðgang → hleður upp creative (fer í review) → leggur inn í veski (Teya, **í bið**)
→ kaupir **flokk + budget** (sér daglega birgða-spá per flokk, `/v1/categories/inventory`).

**Cache-bygging (`apps/api/src/lib/push-cache.ts`, „leið A"):** þegar slot/herferð/útgefandi
breytist → `pushSlotCache` sækir herferðir þar sem `targeting.categories` skarast við flokka
útgefanda, filterar (advertiser virkur, budget eftir, schedule virk, creative-stærð passar,
`requireManualApproval`-ventill) og ritar `slot:{id}` í Redis + seedar `budget:{id}`.

**Heit leið (`apps/serving`):** `ad.ts` les `slot:{id}` úr Redis, filterar út tæmd budget
(`budget:{id}` gate), `select.ts` velur weighted-random (slot_purchased í forgang), skilar
creative + undirritaðan impression-pixel og click-URL (HMAC, `crypto.ts`). `impression.ts`/`click.ts`
staðfesta undirskrift, dedupa (`seen:{sig}`), telja, og `decrementBudget`.

**Uppgjör (cron):** `cron-accrue` (15 mín) tæmir Redis-event-queue → rukkar herferð per batch
`round(550*count/1000)`, lækkar `remainingIsk`, kreditar útgefanda nettó (−20% fee), re-pushar cache.
`cron-aggregate` (klst) skrifar `stats/*`. `cron-payouts` (mánaðarlega) býr til Payout-skjöl;
handvirk millifærsla markar þau `completed`.

---

## 5. Hlutar í dýpt

- **`shared`** — vel uppbyggt, ströng Zod-schema með refine-reglum (ledger-merki, payout-summa,
  schedule). Tveir veikleikar: `.default(['taekni'])` á flokkum (§8 K3) og collection-nöfn ekki öll
  í `COLLECTIONS`.
- **`api`** — þunn routes, logík í services. Vel aðgreint. Vandi: ósamræmt svar-snið (§8 K4) og
  hálf-fjarlægt approval-flæði (§8 R1). `push-cache.ts` gerir of margt í einu falli.
- **`serving`** — hreint og latency-meðvitað. Cache er **write-through only, engin endurnýjun við
  miss** (§8 K2). HMAC-undirritun + replay-dedup nýlega bætt (gott).
- **`dashboard`** — React 19 + TanStack Query (pinnað 5.40.0), hlutverkaskiptar síður. `LandingPage.tsx`
  er **1.477 línur** (of stórt). Routing nýlega stöðugt (K1).
- **`mcp`** — nú hreint publisher-tengi (advertiser-verkfæri fjarlægð 6973955).
- **`snippet`/`widgets`** — browser-artifacts (esbuild), size-budget. Ekki skoðað í þaula hér;
  virðast sjálfstæð.

---

## 6. Þverlæg kerfi

- **Auth (`api/src/lib/auth.ts`):** þrjár tegundir tokena — Firebase ID (dashboard), API-lyklar
  `ak_` (MCP/forrit), og `demo-mock-token` sem **bypassar auth og veitir admin** (fínt í demo,
  MIKILVÆGT að loka fyrir í prod). Admin út frá `ADMIN_EMAILS`.
- **Redis (Upstash):** tvínefni env (`UPSTASH_*` || `KV_*`) athugað á ~8 stöðum (§8 M4).
- **Cron:** gátt með `CRON_SECRET`. Enginn cron endurnýjar slot-cache (§8 K2).
- **Fraud:** HMAC-undirritaðir click/impression + dedup. **Signing-secret fellur í opinberan fasta
  í prod** (§8 M1) — öryggisskuld fyrir go-live.
- **Greiðslur (Teya/Payday/Blikk):** **Í BIÐ** — meðvituð staða, ekki galli. Teya hefur real+stub
  mynstur (`services/teya/`), Payday/Blikk er **ekki útfært** (engar skrár; eldri plön vísa í það).
- **Auto-scan (`services/auto-scan/`, `domain-classifier.ts`):** flokkar lén (Gemini API) + stub.

---

## 7. Það sem virkar vel

- Skýr aðskilnaður (shared/api/serving/dashboard) og þunn routes → logík í services.
- Ströng Zod-schema með viðskiptareglum (ledger-merki, payout-jafna, append-only).
- Latency-meðvituð heit leið með Redis-cache og batch-uppgjöri.
- Nýlegar billing-leiðréttingar (batch-námundun, budget-þak, replay-vörn) eru réttar.
- MCP hreinsað í skýrt publisher-tengi.

---

## 8. Heilsa & áhætta (samandregið)

Demo-staða: virkni-brot raðast ofar en peninga/öryggi. Lagað nú þegar: **K1** (routing),
**M2** (munaðarlaus slot-leit), **M3** (dauður cache-kóði) á `fix/code-rot-pass-1`.

### Enn opið — KRITÍSKT (rót margra bagga)
- **K2 — Serving-cache án endurnýjunar.** Write-through only; enginn cron endurbyggir. 7-daga TTL
  (`CACHE_TTL_SECONDS`) er plástur sem frystir budget/eligibility. **Lausn:** cron sem endurbyggir
  virk slot reglulega + aðskilja TTL-fasta + lækka hot-cache TTL.
- **K3 — `.default(['taekni'])` á flokkum, á BÁÐUM** `Publisher.categories` OG
  `Campaign.targeting.categories`. Eldri/vantandi gögn verða þögult „tækni" → kjarna-módelið
  (flokka-kaup) hittir rangan lager. **Lausn:** fjarlægja default, migration sem bakfærir flokka,
  halda `.min(1)`.
- **K4 — Ósamræmt API-svar-snið** (wrapped `{x}` vs bert). Hver hook hardkóðar ágiskun; typecheck
  grípur ekki. Latent núna (allt í takt) en rót „undefined"-baga sögulega. **Lausn:** ein regla
  (mæli með bert) yfir allar routes + hooks + próf. *Breið breyting — krefst `pnpm test:api`
  (emulator+Java) til staðfestingar; gera sem eigin test-bakaða breytingu.*

### Enn opið — MIKILVÆGT
- **R1 (NÝTT) — Hálf-fjarlægt per-publisher approval-flæði.** `perPublisherApproval` er farið úr
  schema/createCampaign, EN enn lifa: `services/approvals.ts` (`listPublisherQueue`/`publisherReview`),
  `routes/publisher-approvals.ts` (mountað í `index.ts:44`), dashboard `publisher/ApprovalQueue.tsx`
  (route `approvals`), og **push-cache prófin nota `perPublisherApproval` í ~10 fixtures**
  ([apps/api/tests/push-cache.test.ts](apps/api/tests/push-cache.test.ts)). Þetta er dautt-en-tengt
  flæði sem ruglar og prófin endurspegla ekki núverandi schema. **Lausn:** ákveða — fjarlægja
  publisher-approval alveg (samræmi við auto-opt-in), eða endurlífga viljandi; uppfæra próf í
  takt við schema.
- **M1 — Signing-secret opinber fallback í prod** (öryggis-regression). **Lausn:** fail-fast/neita
  að serva ef vantar; tryggja env í Vercel. (Go-live atriði.)
- **M4 — Redis env-tvínefni dreift á ~8 staði.** **Lausn:** einn `isRedisConfigured()`/accessor.
- **demo-mock-token** veitir admin-bypass — loka fyrir í prod.

### Enn opið — SNYRTILEGT
- `LandingPage.tsx` 1.477 línur; `push-cache.ts` gerir of margt — brjóta upp.
- Taxonomy doc-drift (spec með íslenskum slugs vs ASCII í kóða).
- API-lyklar/widget-lyklar collection-nöfn ekki í `COLLECTIONS`.
- Einn `CACHE_TTL_SECONDS` notaður fyrir tvennt (sjá K2/S4 í DIAGNOSIS).

---

## 9. Forgangsröðuð tillaga (fyrir Gemini→report→Claude loop)

1. **R1 + K3** saman — klára flokka-/approval-refactor-ið almennilega (fjarlægja dauða
   approval-flæðið, taka taekni-defaultin, migration, samræma próf). Þetta lokar stærsta
   „hálf-kláraða" rótinni.
2. **K2** — alvöru cache-endurnýjun + TTL-aðskilnaður.
3. **K4** — staðla svar-snið (test-bökuð, eigin breyting).
4. **M1/M4 + demo-mock-token** — fyrir go-live (greiðslur enn í bið, svo ekki bráðnauðsyn núna).

**Aðferð:** hver eining = lítil, test-bökuð breyting, einn commit, keyra `pnpm test:api` /
`pnpm --filter @ada/serving test` í umhverfi með Java áður en merge. Claude fer yfir report
Gemini eftir hverja einingu.
