# Ticket 005: Nordic Editorial UI & Prerender Pipeline

`wayfinder:prototype`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig samþættast Nordic-editorial UI hlutirnir við Tailwind 4 og Playwright static HTML prerender snapshot pípulagnirnar í `apps/dashboard`?

## Resolution / Niðurstaða

1. **Nordic-Editorial Hönnunarkerfi (`editorial.tsx`):**
   - Samnýttir UI hlutir gegnum `src/components/ui/editorial.tsx`:
     - `Eyebrow` (upphleypt yfirlitsheiti í `text-primary`).
     - `EditorialH1` (Sveigjanleg yfirfyrirsögn: `clamp(32px,5vw,48px)`).
     - `NumberedSection` (númeraðir hlutar með stórum tölum og lede-texta).
     - `BigFigure` (áberandi tölfræðisýning: `clamp(44px,8vw,64px)`).
     - `PillButton` og `StepIndicator` (ávalir hnappar og skrefamæling).

2. **Tailwind 4 Litatafla & Þemu (`src/styles.css`):**
   - Byggt á nýjustu Tailwind CSS v4 tækni (`@import 'tailwindcss';` og `@theme`).
   - Stöðluð vörumerkjatákn: `--color-primary: #1e3a8a`, `--color-surface-*`, `--font-sans: Inter`, og `--radius-card: 12px`.

3. **SEO Static Prerender Pípulögn (`prerender:capture` & `prerender:apply`):**
   - Tveggja þrepa ferli fyrir leitarvélabestun:
     1. `prerender:capture`: Playwright keyrir gegn byggðu `dist/` og tekur HTML skyndimyndir af öllum slóðum í `public/sitemap.xml`, sem vistar niðurstöður í `prerender/snapshots.json`. Öryggisgátt kemur í veg fyrir úrelta töku ef `src/` skrár eru nýrri en `dist/`.
     2. `prerender:apply`: Hreint Node skripta sem keyrir á Vercel byggingartíma, les `snapshots.json` og fléttar HTML inn í `dist/<route>/index.html` svo leitarvélar fá tilbúið efni án þess að bíða eftir JS hydration.
