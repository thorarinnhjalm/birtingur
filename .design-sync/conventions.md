# Birtingur UI Kit — usage conventions

Birtingur is an Icelandic self-serve ad platform (advertisers buy category-targeted campaigns; publishers embed ad slots). **All UI copy is Icelandic** — herferðir (campaigns), auglýsingapláss (ad slots), birtingar (impressions), smellir (clicks), amounts as "12.500 kr.". Write designs in Icelandic unless asked otherwise.

## Setup / wrapping

- The core components (Badge, Button, Card, Input, StatCard, EmptyState, ErrorState, LoadingState, Logo, AnalyticsChart) need **no wrapper**.
- The chrome components — **AppShell, Sidebar, TopBar, PublicHeader, PublicFooter** — read router, auth, and data-fetching context. Wrap any screen that uses them in the exported **`DSProvider`**: `<DSProvider>…</DSProvider>`. Without it they crash ("useAuth must be used inside AuthProvider" / "No QueryClient set").
- Icons: the kit uses **Material Symbols ligature spans** — `<span className="material-symbols-outlined">grid_view</span>` — and this pattern appears inside Sidebar/TopBar. Both that font and Inter load via `styles.css`.

## Styling idiom: Tailwind utilities over a Material-style token theme

Style with Tailwind utility classes. The theme tokens (defined in `styles.css` `@theme`) generate the brand families — use these, not raw hex:

| Family | Real class names |
|---|---|
| Brand | `bg-primary` (#1e3a8a navy), `text-primary`, `border-primary`, `text-on-primary` |
| Surfaces | `bg-background`, `bg-surface`, `bg-surface-container-lowest` (white) / `-low` / `bg-surface-container` / `-high` / `-highest` |
| On-colors | `text-on-surface`, `text-on-surface-variant`, `border-outline`, `border-outline-variant` |
| Status | `bg-error`, `text-on-error`, `bg-error-container`; semantic chips via Badge variants |
| Grays | Tailwind `slate` scale is the working gray: `text-slate-900/700/500`, `bg-slate-50`, `border-slate-200` |
| Radii | `rounded-card` (12px, the standard card radius), `rounded-lg`, `rounded-xl` |
| Type | Inter everywhere (`--font-sans`, applied on body); weights 400–900; headings `font-semibold`/`font-bold` |
| Extras | `.glass-card` (white card with #e0e3e5 border) |

**Constraint:** the shipped stylesheet is a compiled subset — standard utilities (layout, flex/grid, gap/p/m scales, the families above) are available, but **arbitrary-value classes like `w-[437px]` may not exist**. For one-off dimensions use inline styles.

## Where the truth lives

Read `styles.css` (the `@theme` block at the top enumerates every token) before inventing styles; per-component API is in each `<Name>.d.ts` and usage notes in `<Name>.prompt.md`. Badge's `variant` is **required** (`success | pending | danger | info | neutral`). Input has built-in `label` and `error` props — don't hand-roll field wrappers. ErrorState hardcodes its "Villa kom upp" heading; you supply only `message`.

## Idiomatic composition

```tsx
<div className="bg-background min-h-screen p-8">
  <h2 className="text-lg font-semibold text-slate-900 mb-4">Yfirlit</h2>
  <div className="grid grid-cols-3 gap-4">
    <StatCard label="Birtingar í dag" value="12.480" delta={{ value: '+4,2%', positive: true }} />
    <StatCard label="Smellir" value="184" delta={{ value: '-1,1%', positive: false }} />
    <StatCard label="Tekjur í mánuðinum" value="48.350 kr." />
  </div>
  <Card className="mt-6 p-6">
    <EmptyState
      title="Engar herferðir fundust"
      description="Stofnaðu nýja herferð til að birta á íslenskum vefjum."
      action={<Button>Stofna herferð</Button>}
    />
  </Card>
</div>
```
