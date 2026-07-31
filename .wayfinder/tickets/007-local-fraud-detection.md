# Ticket 007: Icelandic Ad Fraud & Impression Quality

`wayfinder:task`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig komum við í veg fyrir gervitraffík og bot-smelli á íslenskum niche vefjum svo auglýsendur fái 100% raunveruleg verðmæti fyrir auglýsingafé sitt í ISK?

## Resolution / Niðurstaða

1. **HMAC Undirskriftir & Replay-Vörn (Cryptographic Proof of Serving):**
   - Hver einasti birtingarpixel og smellislóð eru HMAC-undirrituð með `SIGNING_SECRET` (`src/lib/crypto.ts`).
   - Slóðir hafa 1 klukkustundar gildistíma (`IMPRESSION_MAX_AGE_MS = 1h`).
   - Redis `claimSignatureOnce` tryggir að hver undirskrift er aðeins nýtt einu sinni. Endurteknir smellir eða falsaðir pixel-kallanir eru hljóðlega felldar niður.

2. **Hraðatakar & Tvítekningarsía (`apps/serving/src/lib/fraud.ts`):**
   - **Tvísmella-vörn (*Click Deduplication*):** `isClickDeduplicated` læsir tengingu á IP-tölu og auglýsingu í 30 sekúndur. Margir smellir í röð gjaldfærast ekki.
   - **Hraðamörk IP-talna (*Hourly Rate Caps*):** `checkAndIncrementRateLimit` setur ströng hámörk: hámark 30 birtingar og 3 smellir á klukkustund á hverja IP-tölu fyrir hverja herferð.

3. **IAB Sýnileikastaðall (*Viewability Standard*):**
   - Innfellda skriftan (`packages/snippet`) notar `IntersectionObserver` og sendir einungis birtingarpixel þegar auglýsingin er í raun sýnileg á skjá notandans (IAB sýnileikastaðall). Fuldar eða bakgrunnsbirtingar innheimtast aldrei.
