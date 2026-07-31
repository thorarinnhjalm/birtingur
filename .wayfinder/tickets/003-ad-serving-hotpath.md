# Ticket 003: Ad Serving Hot-Path & Privacy Contract

`wayfinder:task`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig er hraðvirkni (`latency`) og persónuvernd tryggð í `apps/serving` á heitu slóðinni (`/v1/ad`, impression pixel, click tracking) án vafrakakna (_cookies_)?

## Resolution / Niðurstaða

1. **Persónuvernd án vafrakakna (Cookie-Free Guarantee):**
   - Engin `Set-Cookie` færsla er tekin af `apps/serving` á neinum slóðum. Prófunin `tests/ad-route.test.ts` staðfestir: `expect(res.headers.get('set-cookie')).toBeNull()`.
   - Tíðnitakmörkun (_frequency capping_) notar einungis `localStorage` visitor token (`?vid=`) af upprunavef útgefanda. Ef samþykki vantar skilar `getVisitorToken` tómum streng `''` og enginn tilbúinn auðkennislykill er geymdur.

2. **Lágt viðbragðsþol (Hot-Path Latency Optimization):**
   - Samsetning herferða og hólfa (_category matching_) er reiknuð fyrirfram við uppfærslu skyndiminnis (`pushCacheForCampaign`).
   - Serving heita slóðin les beint úr Redis (`SlotCacheEntry`) og velur auglýsingu í minni með `selectCreative`.
   - Budget-takmörk (`budget:{id}`) og pacing-takmörk eru staðfest með hraðvirkri Redis pípulögn.

3. **Öryggi gegn svikum & HMAC undirskriftir:**
   - Slóðir birtinga og smella eru HMAC-undirritaðar með `SIGNING_SECRET` (`src/lib/crypto.ts`).
   - Replay-vörn í Redis (`seen:{sig}`) komar í veg fyrir að sami smellur eða birting sé send mörgum sinnum.
   - Biðraðir í Redis eru aðskildar (`events:stats` og `events:accrual`) svo tvær sjálfstæðar crons tæmi hvor sína röð án árekstra.

4. **Varabirtingar (Fallback Handling):**
   - Ef engin herferð passar eða fjárhagsáætlun er tæmd, skilar þjónustan entar vöruauglýsingu (Birtingur House Ad) eða gegnsæju hulstri (Transparent SVG/GIF). Báðar gerðir senda HMAC-undirritaðan birtingarpixel svo traffík útgefanda tapist aldrei úr tölfræði.
