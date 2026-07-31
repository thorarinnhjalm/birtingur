# Ticket 012: English SEO Content Clusters & Category Landing Pages

`wayfinder:task`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig á að útfæra ensku leitarorðastefnuna (SEO / GEO / LLMO) með sérhæfðum leiðbeiningum (`/en/guides/*`) og flokkasíðum (`/en/categories/*`) til að fanga leitir eins og "cookie-free ad network", "adsense alternative for niche blogs" og "category display advertising"?

## Resolution / Niðurstaða

1. **Flokkasíður (`apps/dashboard/src/pages/EnglishCategoryPage.tsx`):**
   - Útfærðar dynamískar síður á leiðinni `/en/categories/:slug` fyrir helstu flokkana (t.d. `/en/categories/food`, `/en/categories/tech`, `/en/categories/travel`, `/en/categories/fashion`, `/en/categories/finance`).
   - Sýnir sértækan texta, kosti fyrir útgefendur (80% net payout) og kosti fyrir auglýsendur (flat CPM pricing).

2. **SEO Fræðslugreinar (`apps/dashboard/src/pages/EnglishGuidePage.tsx`):**
   - Grein 1: `/en/guides/cookieless-advertising-2026` ("Cookieless Advertising in 2026: Why Category Networks Outperform Tracking Cookies")
   - Grein 2: `/en/guides/adsense-alternatives-niche-blogs` ("The Creator Guide to Monetizing Niche Blogs Without Cookie Banners")

3. **Sitemap & SEO skráning:**
   - Öllum nýjum `/en/categories/*` og `/en/guides/*` slóðum bætt í `public/sitemap.xml`.
