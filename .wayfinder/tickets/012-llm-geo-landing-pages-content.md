# Ticket 012: English SEO Content Clusters & Category Landing Pages

`wayfinder:task`
`status: active`
`assignee: @antigravity`
`created_at: 2026-07-31`

## Question

Hvernig á að útfæra ensku leitarorðastefnuna (SEO / GEO / LLMO) með sérhæfðum leiðbeiningum (`/en/guides/*`) og flokkasíðum (`/en/categories/*`) til að fanga leitir eins og "cookie-free ad network", "adsense alternative for niche blogs" og "category display advertising"?

## Proposed Architecture / Tillaga

1. **Efnisflokkasíður (`/en/categories/:slug`):**
   - Búa til dynamískar sérsíður fyrir stærstu flokkana (t.d. Food & Culinary, Tech & Innovation, Travel & Outdoors).
   - Innihalda sérhæfð metatög, Schema.org gögn og sérsniðin söluskilaboð fyrir hvorn hóp (bloggara vs auglýsendur í þeim geira).

2. **Fræðslugreinar & Handbækur (`/en/guides/*`):**
   - Grein 1: _"Cookieless Advertising in 2026: Why Category Networks Outperform Tracking Cookies"_
   - Grein 2: _"The Creator’s Guide to Monetizing Niche Blogs Without Cookie Banners"_

3. **Sitemap & Prerender Integration:**
   - Bæta öllum nýjum `/en/categories/*` og `/en/guides/*` slóðum við í `public/sitemap.xml` og Playwright prerender pipeline.
