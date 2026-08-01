# SEO + GEO Backlog — Birtingur

## Quick wins (high impact / low effort)

- [ ] Rewrite `/` title+description to front-load "birtingaþjónusta" with the 550 kr. CPM hook — _why:_ birtingaþjónusta 66 impr · pos 8.8 · 0% CTR (expected 2–5%) · _effort:_ S · _files:_ `apps/dashboard/src/pages/LandingPage.tsx`
- [ ] Rewrite `/auglysendur` title+description with price + "engin uppboð" hook — _why:_ auglýsingar á netinu 11 impr · pos 53.9; CTR prep for when it climbs · _effort:_ S · _files:_ `apps/dashboard/src/pages/AdvertiserLanding.tsx`
- [ ] Add "selja auglýsingar á netinu" phrasing to `/midlar` title — _why:_ query at pos 19.5 · 6 impr; title only says "á vefsíðu" · _effort:_ S · _files:_ `apps/dashboard/src/pages/PublisherLanding.tsx`
- [ ] New guide: "Hvað eru birtingar? CPM, birtingaspá og verð vefauglýsinga" — _why:_ birtingar is the top query (126 impr · pos 17.9) with no dedicated page; also catches fastcpm (pos 10) · _effort:_ M · _files:_ `apps/dashboard/src/lib/blog-data.ts`, `public/sitemap.xml`
- [ ] New guide: "Vefborðar: stærðir, hönnun og sjálfvirk borðagerð" — _why:_ vefborðar pos 56.5; zero competition-level content in Icelandic; showcases verified AI banner maker · _effort:_ M · _files:_ same
- [ ] Add Icelandic handbækur to `llms.txt` — _why:_ GEO; llms.txt currently lists only /en guides · _effort:_ S · _files:_ `apps/dashboard/public/llms.txt`
- [ ] Recapture prerender snapshots + commit — _why:_ nothing above reaches crawlers without it · _effort:_ S

## Strategic bets (high impact / higher effort)

- [ ] `Article` JSON-LD + visible dates in `BlogPost.tsx` (covers all guides at once) — _why:_ GEO extraction + freshness signals · _effort:_ M
- [ ] Internal-linking pass: `/` → guides, guides → `/auglysendur`+`/midlar` with keyword anchors — _why:_ spreads authority to striking-distance pages · _effort:_ M
- [ ] Off-site entity work: get Birtingur listed/mentioned on Icelandic directories & tech media — _why:_ brand query at pos 7.4 signals weak entity corroboration; models cite corroborated entities · _effort:_ L (beyond codebase)

## Watchlist / later

- [ ] Region pages (26) — watch GSC for thin-content non-performance; consolidate if they earn nothing by autumn
- [ ] `birtingahús` (pos 35) — the vs-birtingahús guide should climb on its own; revisit if stuck >30 after new interlinking
- [ ] Do NOT build for `ókeypis auglýsingar á netinu` / `auglýsingar á google` — mismatched intent

## Done (this revision, 2026-08-01)

- [x] `/` title+description front-loads "birtingaþjónusta" + 550 kr. CPM hook → watch `birtingaþjónusta` CTR/position
- [x] `/auglysendur` title carries price + "auglýsingar á netinu" phrasing → watch `auglýsingar á netinu`
- [x] `/midlar` title now "Selja auglýsingar á netinu" → watch that query (pos 19.5)
- [x] New guide `/handbaekur/hvad-eru-birtingar-cpm-verd` → watch `birtingar` (126 impr · pos 17.9) + `fastcpm`
- [x] New guide `/handbaekur/vefbordar-staerdir-og-bordagerd` → watch `vefborðar` (pos 56.5)
- [x] Icelandic handbækur added to `llms.txt`; both new slugs in `sitemap.xml`; snapshots recaptured (54 routes)
