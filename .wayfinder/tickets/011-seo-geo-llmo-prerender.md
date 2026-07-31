# Ticket 011: SEO, GEO & Structured Data Optimization

`wayfinder:task`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig hámarka við SEO, GEO, JSON-LD Structured Data (Schema.org) og Playwright static HTML prerender snapshot pípulagnir fyrir ensku síðuna `/en` svo leitarvélar og gervigreind finni vettvanginn?

## Resolution / Niðurstaða

1. **Meta Tög & JSON-LD Structured Data:**
   - Uppfært `updateSEO` kvaðningu í `EnglishLanding.tsx` með enskum titli, kanónískri slóð (`https://www.birtingur.app/en`) og lýsingu.
   - Bætt við JSON-LD Structured Data (`SoftwareApplication` Schema.org) fyrir leitarvélar og LLM gervigreindarleitir.

2. **Sitemap.xml Skráning:**
   - Bætt við `<loc>https://www.birtingur.app/en</loc>` í `public/sitemap.xml`.
   - Playwright static prerender snapshot pípulögnin (`prerender:capture` -> `prerender:apply`) mun sjálfkrafa grípa og skrifa statískt HTML í `dist/en/index.html` við byggingu.
