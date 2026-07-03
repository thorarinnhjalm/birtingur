# Nordic Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin 11 dashboard/marketing screens to the approved Nordic-editorial designs from the Claude Design project "Birtingur UI Kit", preserving every screen's existing data wiring.

**Architecture:** Each designed screen exists as a self-contained spec at `docs/superpowers/specs/2026-07-03-redesign-templates/<name>.dc.html` (fetched from the design project in Task 0). Implementation replaces the JSX/presentation of the corresponding existing page while keeping its TanStack Query hooks, `apiFetch` calls, mutations, routing, and auth intact. A small set of shared "editorial" primitives (Task 1) prevents 11 screens from re-implementing the same visual patterns.

**Tech Stack:** React 19, Tailwind CSS 4 (`@theme` tokens in `apps/dashboard/src/styles.css`), TanStack Query 5.40.0, react-router 7, `@ada/shared` (categories, ISK formatting, constants).

## Global Constraints

- **Never change data plumbing:** every existing `useQuery`/`useMutation`/`apiFetch` call, route path, and auth guard in a page being redesigned is preserved verbatim unless a task says otherwise.
- **Mock data in templates is placeholder only:** the `DCLogic` class and its constants (category lists, wallet balances, stats) in each `.dc.html` are design-time mocks. Real values come from the page's existing hooks; categories come from `AD_CATEGORIES` (`@ada/shared`); ISK formatting via the shared `formatIsk`-style helpers in `@ada/shared` (check `packages/shared/src/formatting/`) or the template's dot-separator rule `12.500 kr.`.
- **Template inline styles → Tailwind utilities** where a utility exists (`#1e3a8a`→`bg-primary`/`text-primary`, `#f6f7f9`→`bg-background`, `#0f172a`→`text-slate-900`, `#64748b`→`text-slate-500`, `#e2e8f0`→`border-slate-200`, radius 14px→`rounded-card`+local override where needed, `font-variant-numeric:tabular-nums`→`tabular-nums`). Keep inline `style={{}}` only for one-off values with no utility (e.g. `letterSpacing:'-0.03em'`, `clamp()` font sizes).
- **All copy Icelandic**, taken verbatim from the templates (they carry the approved copy).
- **USP/claims guardrail:** marketing copy must not introduce claims beyond the templates; the templates were built from the verified USP list (550 kr. CPM, category buying, no third-party cookies, 80/20 split, monthly payouts ≥5.000 kr., viewability-counted impressions). Do not add publisher counts, "sjálfvirkar útgreiðslur", or bookkeeping-integration claims.
- **Per-task gate:** `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint` must pass before each commit; `pnpm --filter @ada/dashboard build` at Tasks 7 and 13.
- **Material Symbols spans** (`<span className="material-symbols-outlined">lock</span>`) are the icon idiom in templates; lucide-react equivalents are acceptable where the page already uses lucide.
- Commit after every task: `git add <files> && git commit -m "feat(redesign): <screen>"`.

---

### Task 0: Materialize the design templates (orchestrator-only)

**Files:**

- Create: `docs/superpowers/specs/2026-07-03-redesign-templates/{landing,auth,dashboard,campaigns,buy-flow,creative-library,billing,publisher-dashboard,publisher-billing,publisher-onboarding,sites}.dc.html`

**Interfaces:**

- Produces: the 11 spec files every later task reads. Fetched via the `DesignSync` tool (`get_file`, project `8f5fa872-7e15-42a4-95be-10e2578a487d`, paths `templates/<dir>/<Name>.dc.html`). Strip nothing; save content verbatim.

- [ ] **Step 1:** For each of the 11 templates, `DesignSync(get_file)` and `Write` the content to the spec path above.
- [ ] **Step 2:** Sanity check: `grep -L "x-dc" docs/superpowers/specs/2026-07-03-redesign-templates/*.dc.html` returns nothing (every file is a design canvas file).
- [ ] **Step 3:** `git add docs/superpowers/specs/2026-07-03-redesign-templates && git commit -m "docs(redesign): materialize approved Claude Design templates as specs"`

### Task 1: Editorial primitives

**Files:**

- Create: `apps/dashboard/src/components/ui/editorial.tsx`
- Test: `apps/dashboard/src/components/ui/editorial.test.tsx`

**Interfaces:**

- Produces (all named exports, used by every screen task):
  - `Eyebrow({children, className}: {children: ReactNode; className?: string})` — uppercase 13px, `tracking-[0.16em]`, `text-primary`, `font-semibold`.
  - `EditorialH1({children}: {children: ReactNode})` — `clamp(32px,5vw,48px)`, weight 800, `letterSpacing:'-0.03em'`, `lineHeight:1.0`.
  - `NumberedSection({n, title, lede, children}: {n: string; title: string; lede?: string; children: ReactNode})` — the `01 / Veldu flokka` header pattern from the buy-flow template (28px numeral in `text-primary`, 24px title, slate-500 lede at `max-w-[52ch]`).
  - `BigFigure({value, suffix}: {value: string; suffix?: string})` — `clamp(44px,8vw,64px)` weight-800 tabular-nums figure with 0.36em suffix.
  - `PillButton({active, children, onClick}: {active?: boolean; children: ReactNode; onClick?: () => void})` — the `25.000 kr.` chip: white bg, `border-slate-200`, `rounded-full`, 14px semibold.
  - `StepIndicator({steps, current}: {steps: string[]; current: number})` — `01 Flokkar — 02 Fjárhæð — 03 Greiðsla` row with 26px hairline separators.

- [ ] **Step 1: Write the failing test** — render each primitive with @testing-library/react (jsdom is configured) and assert visible text/roles:

```tsx
import { render, screen } from '@testing-library/react';
import {
  Eyebrow,
  EditorialH1,
  NumberedSection,
  BigFigure,
  PillButton,
  StepIndicator,
} from './editorial';

test('editorial primitives render their content', () => {
  render(
    <NumberedSection n="01" title="Veldu flokka" lede="Lede texti">
      <Eyebrow>Ný herferð</Eyebrow>
      <EditorialH1>Stofna herferð</EditorialH1>
      <BigFigure value="50.000" suffix="kr." />
      <PillButton active>25.000 kr.</PillButton>
      <StepIndicator steps={['Flokkar', 'Fjárhæð', 'Greiðsla']} current={0} />
    </NumberedSection>,
  );
  expect(screen.getByText('Veldu flokka')).toBeDefined();
  expect(screen.getByText('Stofna herferð')).toBeDefined();
  expect(screen.getByText('50.000')).toBeDefined();
  expect(screen.getByText('25.000 kr.')).toBeDefined();
  expect(screen.getByText('Fjárhæð')).toBeDefined();
});
```

- [ ] **Step 2:** `pnpm --filter @ada/dashboard test -- editorial` → FAIL (module not found).
- [ ] **Step 3:** Implement the six primitives in `editorial.tsx` matching the buy-flow template's exact values (copy the inline metrics from `docs/superpowers/specs/2026-07-03-redesign-templates/buy-flow.dc.html`).
- [ ] **Step 4:** `pnpm --filter @ada/dashboard test -- editorial` → PASS; typecheck+lint pass.
- [ ] **Step 5:** `git add apps/dashboard/src/components/ui/editorial.* && git commit -m "feat(redesign): add editorial primitives"`

### Task 2: Buy flow (CampaignCreate)

**Files:**

- Modify: `apps/dashboard/src/pages/advertiser/CampaignCreate.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/buy-flow.dc.html`

**Interfaces:**

- Consumes: Task 1 primitives; the page's existing inventory query (`/v1/categories/inventory`), wallet balance query, and campaign-create mutation — read `CampaignCreate.tsx` first and keep its data layer.
- Produces: same route/behavior, new presentation: numbered 3-step single page (category card grid with selected-ring state; budget slider 10.000–500.000 step 5.000 + `PillButton` presets 25/50/100/200k; live forecast panel `bg-[#f1f5fd] border-[#dbe4f7]` computing `round(budget/550*1000)` total ÷30 per-day; payment section with wallet balance card, Teya card row, VSK 24% breakdown, full-width `Button`, lock-icon reassurance line).

- [ ] **Step 1:** Read the spec file and current page; enumerate its hooks/mutations in a comment-free scratch note.
- [ ] **Step 2:** Reimplement presentation per spec; categories from `AD_CATEGORIES` joined with real inventory counts (template's `~142.000 á dag í boði` label uses the inventory forecast value per category); forecast math from the template's `renderVals` (550 CPM, 30 days, VSK 24%); wallet sufficient/insufficient branch per template.
- [ ] **Step 3:** typecheck + lint → PASS.
- [ ] **Step 4:** `git commit -m "feat(redesign): Nordic editorial buy flow"`

### Task 3: Advertiser dashboard

**Files:**

- Modify: `apps/dashboard/src/pages/advertiser/Dashboard.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/dashboard.dc.html`

**Interfaces:**

- Consumes: Task 1 primitives; existing stats/campaign queries and `AnalyticsChart` (mode `advertiser`); `AppShell` stays the chrome.
- Produces: same route, template's layout — editorial page header, stat figures, chart card, campaign table styling per spec.

- [ ] **Step 1:** Read spec + current page; keep every query.
- [ ] **Step 2:** Reimplement presentation per spec (exact copy, spacing, table row treatment from the template).
- [ ] **Step 3:** typecheck + lint → PASS. **Step 4:** `git commit -m "feat(redesign): advertiser dashboard"`

### Task 4: Campaign list

**Files:**

- Modify: `apps/dashboard/src/pages/advertiser/CampaignList.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/campaigns.dc.html`

Same 4-step shape as Task 3: read spec + page → reimplement presentation (keep queries, `EmptyState` for zero campaigns, `Badge` statuses) → gate → `git commit -m "feat(redesign): campaign list"`.

### Task 5: Creative library

**Files:**

- Modify: `apps/dashboard/src/pages/advertiser/CreativeLibrary.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/creative-library.dc.html`

Same 4-step shape → `git commit -m "feat(redesign): creative library"`.

### Task 6: Billing / TopUp

**Files:**

- Modify: `apps/dashboard/src/pages/advertiser/TopUp.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/billing.dc.html`

Keep the Teya top-up mutation + wallet/ledger queries exactly; presentation per spec (VSK 24% breakdown rows; the template's trust line with lock icon). Same 4-step shape → `git commit -m "feat(redesign): advertiser billing"`.

### Task 7: Mid-point build gate

- [ ] **Step 1:** `pnpm --filter @ada/dashboard build` → succeeds.
- [ ] **Step 2:** `pnpm --filter @ada/dashboard test` → PASS (incl. Task 1 test).
- [ ] **Step 3:** Fix anything broken; commit fixes as `fix(redesign): mid-point gate`.

### Task 8: Publisher dashboard

**Files:**

- Modify: `apps/dashboard/src/pages/publisher/Dashboard.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/publisher-dashboard.dc.html`

Keep slot/stats queries + `AnalyticsChart` mode `publisher`. Same 4-step shape → `git commit -m "feat(redesign): publisher dashboard"`.

### Task 9: Publisher billing / Earnings

**Files:**

- Modify: `apps/dashboard/src/pages/publisher/Earnings.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/publisher-billing.dc.html`

Copy rule: monthly payouts ≥ 5.000 kr., 80% share — template copy verbatim; keep payout/earnings queries. Same 4-step shape → `git commit -m "feat(redesign): publisher billing"`.

### Task 10: Publisher onboarding

**Files:**

- Modify: `apps/dashboard/src/pages/publisher/Onboarding.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/publisher-onboarding.dc.html`

Keep site-registration mutation + category multi-select backed by `AD_CATEGORIES`. Same 4-step shape → `git commit -m "feat(redesign): publisher onboarding"`.

### Task 11: Sites / SlotList

**Files:**

- Modify: `apps/dashboard/src/pages/publisher/SlotList.tsx`
- Spec: `docs/superpowers/specs/2026-07-03-redesign-templates/sites.dc.html`

Keep slot queries + embed-snippet copy affordance. Same 4-step shape → `git commit -m "feat(redesign): sites list"`.

### Task 12: Auth + Landing

**Files:**

- Modify: `apps/dashboard/src/pages/SignIn.tsx` (spec `auth.dc.html`)
- Modify: `apps/dashboard/src/pages/LandingPage.tsx` (spec `landing.dc.html`)

Auth keeps the Firebase Google/email sign-in handlers exactly. Landing keeps `PublicHeader`/`PublicFooter` and routes; sections/copy per template (verified USPs only). Steps: read specs + pages → reimplement → gate → `git commit -m "feat(redesign): auth + landing"`.

### Task 13: Final verification + close-out

- [ ] **Step 1:** `pnpm verify` (repo gate: format:check + typecheck + lint) → PASS; `pnpm --filter @ada/dashboard build` → PASS.
- [ ] **Step 2:** Visual pass: `pnpm --filter @ada/dashboard dev` against the emulator seed (`pnpm emulator` + `pnpm --filter @ada/api seed`), screenshot each redesigned route, compare against its template side-by-side.
- [ ] **Step 3:** Update `apps/dashboard/.design-sync-styles.css`/previews only if new utility classes appeared that previews need; then `/design-sync` re-sync pushes the updated kit (new `editorial.tsx` primitives are internal — sync only if the user wants them as DS components).
- [ ] **Step 4:** Final commit + summary of any template details deliberately deviated from.

## Self-review notes

- Coverage: 11 templates ↔ Tasks 2–6, 8–12 (10 pages + landing/auth pair) ✓; primitives Task 1; materialization Task 0; gates Tasks 7/13.
- Placeholder scan: tasks 4/5/8–11 compress repeated steps by reference to the identical 4-step shape with per-task specifics (spec path, preserved data layer, commit message) — acceptable because the authoritative code-level content is the referenced spec file itself, which every implementer must read.
- Type consistency: primitive signatures defined once in Task 1 and only consumed elsewhere ✓.
