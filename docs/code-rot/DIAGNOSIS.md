# Greining á kerfinu — 2026-06-05

## Samantekt

Eftir stóra „category network buying" merge-ið (06-04) kom flóð af reaktívum „fix"
commitum 06-05 sem eru að miklu leyti **plástrar sem fela rótina** frekar en að laga
hana — sumir bakka meðvitaðar ákvarðanir (signing-secret) eða spilla gögnum
(categories→taekni). Kerfið typecheck-ar hreint, svo vandamálin eru **runtime- og
samninga-eðlis (contracts), ekki týpuvillur** — þ.e. nákvæmlega það sem TypeScript
grípur ekki. Þrjár undirliggjandi rætur valda meirihluta baganna: (1) óstöðug Vercel
SPA-routing uppsetning, (2) serving-cache án endurnýjunar við miss, og (3) ósamræmt
API-svar-snið (wrapped vs bert). Staðan er enn demo, svo virkni-brot eru sett ofar en
peninga/öryggis-atriði — en þau síðarnefndu eru tímasprengjur fyrir go-live.

---

## KRITÍSKT

### K1. Dashboard Vercel-routing: ógild blanda af `routes` + `cleanUrls`
**Hvar:** `apps/dashboard/vercel.json`
**Vandamál:** Skráin notar *legacy* `routes`-fylkið (`{ handle: filesystem }` + catch-all á
`/index.html`) OG `"cleanUrls": true` samtímis. Vercel leyfir ekki að blanda `routes`
við `cleanUrls`/`rewrites`/`headers` — þegar `routes` er til staðar eru hin hunsuð eða
deploy hagar sér ófyrirsjáanlega. Þetta er nær örugglega rótin að endurteknu
„page-break/redirect on refresh" einkenninu og þremur aðskildum routing-fixum á tveimur
dögum (`84fc877`, `0d194eb`, `981098e`).
**Tillaga:** Velja *annað* sniðið — nútíma: sleppa `routes`, nota `cleanUrls` + `headers`
(fyrir assets) + einn `rewrites` `{ "source": "/(.*)", "destination": "/index.html" }`.
Þetta er staðlað SPA-fallback og hættir churn-inu.

### K2. Serving-cache hefur enga endurnýjun við „miss" — 7-daga TTL er plástur
**Hvar:** `apps/serving/src/lib/cache.ts:7-9` (`getSlotCache` skilar `null` við miss);
TTL-plásturinn í `packages/shared/src/constants.ts:27` (`CACHE_TTL_SECONDS = 7*24*60*60`,
commit `71d9829`).
**Vandamál:** Cache er **write-through only** — eini ritarinn er `apps/api`
(`push-cache.ts`) við skrif/edits og í accrual-cron. Serving les bara; við miss er ekkert
sem endurbyggir. Þegar slot-cache rennur út (var 60s) fær serving `null` → engin
auglýsing, þar til næsta skrif gerist. Lausnin sem var valin — hækka TTL í **7 daga** —
felur rótina og býr til nýtt vandamál: `budgetExhausted`-flaggið og `activeCreatives`
frjósa í allt að 7 daga fyrir slot sem fá engin skrif. Sami fasti er líka misnotaður
fyrir budget-teljarann (`budget:{id}` með `ex: CACHE_TTL_SECONDS * 5` = 35 dagar í
[push-cache.ts:106](apps/api/src/lib/push-cache.ts#L106)).
**Tillaga:** Skilgreina raunverulega endurnýjun: annaðhvort (a) read-through í serving
(við miss → kalla létt endapunkt/agnað sem endurbyggir cache), eða (b) regluleg
cron-endurýting allra virkra slot-a. Aðskilja síðan TTL-fastana tvo (hot-cache vs
budget-teljari) og lækka hot-cache TTL aftur í mínútur.

### K3. `categories` defaultar á `['taekni']` — eyðileggur flokka-módelið fyrir eldri gögn
**Hvar:** `packages/shared/src/schemas/publisher.ts:60-63` (commit `e657c7b`)
**Vandamál:** `.min(1).default(['taekni'])` þýðir að sérhver publisher án `categories`
(öll eldri gögn) er **þögult lesinn sem „tækni"**. Matarblogg verður tækni-vefur. Þar
sem allt kaup-/serving-módelið byggir á flokkun ([push-cache.ts:68](apps/api/src/lib/push-cache.ts#L68)
matar `targeting.categories` við `publisher.categories`), þá nær majónes-auglýsandi sem
kaupir `matur` **aldrei** til þessara vefja. Þetta var sett „for legacy compatibility to
fix global validation bug" — þ.e. plástur ofan á **vantandi gagna-migration**, og gerir
`.min(1)` tannlaust.
**Tillaga:** Bakka defaultinu. Keyra einskiptis-migration sem setur raunverulega flokka
á existing publishers (nota classifier-tillögu + handvirka staðfestingu). Halda `.min(1)`
sem alvöru-kröfu svo nýskráning verði að velja flokk.

### K4. Ósamræmt API-svar-snið (wrapped vs bert) — rót „undefined"-baga í dashboard
**Hvar:** dashboard-hookar gera ráð fyrir **wrapped** svari: `useCampaigns.ts:14`
(`{ campaigns }`), `useReviewQueue.ts:10` (`{ queue }`), `usePublisher.ts:83`
(`{ slots }`) o.s.frv. — en flokka-vinnan breytti sumum endapunktum í **bert** svar
(`usePublisher.ts`: `apiFetch<Publisher>('/v1/publishers/me')`, `apiFetch<Slot[]>(...)`).
**Vandamál:** API-ið hefur **enga eina reglu** um svar-snið — helmingur skilar `{ x: ... }`,
helmingur beru gildi, og hver hook hardkóðar sína ágiskun. Hvert misræmi skilar `undefined`
þögult (typecheck grípur það ekki). Þetta er rótin að endurteknu „object unwrapping" fixunum
(t.d. `ddfa141`).
**Tillaga:** Velja eina reglu (mæli með **bert svar** + staðlað villu-snið) og samræma
*alla* endapunkta + hook-a við hana. Þetta fjarlægir heilan flokk af framtíðar-bögum.

---

## MIKILVÆGT

### M1. Signing-secret fellur aftur í opinberan fasta í production (öryggis-regression)
**Hvar:** `apps/serving/src/lib/crypto.ts:3-17` (commit `623d902`)
**Vandamál:** Markvisst öryggisfix (krasha ef `SIGNING_SECRET` vantar) var bakkað — núna
skilar fallinu **hardkóðuðum, opinberum** lykli í production með aðeins `console.error`.
Hver sem les repo-ið getur falsað click/impression-undirskriftir → svindl/budget-dráp.
Demo-staða gerir þetta ekki bráðakritískt **núna**, en það er tímasprengja fyrir go-live
og bakkar meðvitað fix.
**Tillaga:** Endurheimta fail-fast í production (eða a.m.k. neita að serva undirritaðar
slóðir). Tryggja `SIGNING_SECRET` í Vercel env. Ef krass-við-ræsingu olli deploy-vandræðum
var það merki um vantandi env-breytu, ekki um að fixið væri rangt.

### M2. Munaðarlaus auglýsenda-slot-leit stangast á við flokka-módelið
**Hvar:** `apps/api/src/index.ts:40` (`/v1/slots/search`), `apps/api/src/services/slot-search.ts`,
`apps/api/src/routes/slots-search.ts`, `apps/dashboard/src/hooks/usePublisher.ts:79-85`
(`useSearchSlots`, „for advertisers creating campaigns").
**Vandamál:** Þetta er gamla auglýsenda-uppgötvunin (leita að slot eftir stærð/maxCpm) sem
flokka-módelið gerði úrelta — auglýsendur velja ekki lengur stök slot. Kóðinn lifir samt,
afhjúpaður og kallanlegur, og skilar `{ slots }` (wrapped) á meðan systkina-endapunktar
skila beru — ýtir undir K4. Óljóst hvort `useSearchSlots` er enn kallað (líklega
munaðarlaust).
**Tillaga:** Staðfesta að ekkert noti `useSearchSlots`/`/v1/slots/search`, fjarlægja svo
hook, route og service. (Ef á að halda „browse"-virkni, þá flokka-byggðri, ekki
size/maxCpm.) **[ÞARF STAÐFESTINGU: má fjarlægja slot-search alveg?]**

### M3. Dauður tvítekinn cache-kóði í serving
**Hvar:** `apps/serving/src/lib/cache.ts:11-17` (`pushSlotCache(entry)`, `invalidateSlot`)
**Vandamál:** Hvorugt fall er kallað neins staðar í `apps/serving` (staðfest með grep).
Þau tvítaka cache-ritun sem `apps/api/src/lib/push-cache.ts` á í raun — sem ruglar hver
„á" cache-ritun og lætur líta út fyrir að serving riti cache (sem það gerir ekki).
**Tillaga:** Fjarlægja dauðu föllin; halda aðeins `getSlotCache`. Skjalfesta að
cache-ritun eigi heima í `apps/api`.

### M4. Redis-env-breytur með tvöföldu nafni, dreift á ~8 staði
**Hvar:** `apps/serving/src/lib/redis.ts:7-8`, `apps/api/src/lib/redis.ts:7-8`, og inline
`if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)` í
`apps/api/src/services/slots.ts:53,116,176` og `campaigns.ts:70,122` (commit `4ddaf0f`).
**Vandamál:** Tvö nöfn (`UPSTASH_*` vs Vercel `KV_*`) eru athuguð víða, og service-skrár
endurtaka env-check sem redis-libið gerir nú þegar (`getRedis()` kastar sjálft ef vantar).
Þetta er afleiðing af env-ósamræmi og býður upp á að gleyma einum stað.
**Tillaga:** Einn hjálpari, t.d. `isRedisConfigured()` í `lib/redis.ts`, notaður alls
staðar; staðla á eitt env-nafn og skjalfesta hitt sem alias.

---

## SNYRTILEGT

### S1. Taxonomy-ósamræmi milli spec og kóða
**Hvar:** `docs/superpowers/specs/2026-06-04-category-network-buying-design.md:55-57`
(`ferðalög`, `tíska_fegurð` með íslenskum stöfum) vs `packages/shared/src/constants.ts`
(ASCII slugs `ferdalog`, `tiska_fegurd`).
**Vandamál:** Doc-drift; getur valdið ruglingi um hver raunverulegu slug-gildin eru.
**Tillaga:** Uppfæra spec til að nota ASCII-slug + íslenskt label (eins og kóðinn gerir).

### S2. Skráanafna-ósamræmi
**Hvar:** `apps/api/src/routes/slots-search.ts` (fleirtala) vs
`apps/api/src/services/slot-search.ts` (eintala).
**Vandamál:** Smávægilegt en ýtir undir leitar-/grep-villur. (Leysist ef M2 fjarlægir þau.)
**Tillaga:** Samræma nafnavenju; eða fjarlægja með M2.

### S3. Of stórar/of-margt-gerandi skrár
**Hvar:** `apps/dashboard/src/pages/LandingPage.tsx` (>1.400 línur, marg-tab markaðssíða í
einni skrá); `apps/api/src/lib/push-cache.ts` (sækir, filterar, raðar, mapar, ritar cache
og seedar budget-teljara í einu falli).
**Vandamál:** Erfitt að breyta án hliðarverkana; há cognitive load; líkleg uppspretta
framtíðar-rots.
**Tillaga:** Brjóta LandingPage í hluti (Hero, Manifesto, Pricing, FAQ, Footer). Skipta
`pushSlotCache` í `resolveEligibleCreatives` + `writeCache` + `seedBudgetCounters`.

### S4. Einn fasti fyrir tvo óskylda hluti
**Hvar:** `packages/shared/src/constants.ts:27` `CACHE_TTL_SECONDS` notað bæði fyrir
hot-cache eviction og (×5) budget-teljara TTL.
**Vandamál:** Að stilla annað brenglar hitt (sjá K2).
**Tillaga:** Aðskilja: `SLOT_CACHE_TTL_SECONDS` og `BUDGET_COUNTER_TTL_SECONDS`.

---

## Atriði sem þarf að staðfesta áður en lagað er

1. **M2:** Má fjarlægja `/v1/slots/search` + `useSearchSlots` alveg, eða á einhver
   „browse categories"-virkni að koma í staðinn?
2. **K3-migration:** Eru existing publishers í Firestore (prod/demo) sem þarf að
   bakfæra flokka á, eða er óhætt að núllstilla demo-gögn?
3. **Stats-þjónustur** (`advertiser/publisher/campaign/admin-stats.ts`): virðast aðskildar
   (ekki bein tvítekning) en lesa sömu `stats/*`-skjöl — kanna hvort sameiginlegur
   les-hjálpari myndi fækka villum. (Ekki flaggað sem rot, en vert að skoða.)
