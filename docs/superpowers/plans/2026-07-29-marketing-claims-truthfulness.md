# Marketing Claims Truthfulness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every public-facing claim on birtingur.app true against the shipped system, and add an automated guard so false claims cannot silently return.

**Architecture:** This is a copy-correction plan, not a feature plan. Each task fixes one file's false claims and, in the same commit, extends a single regression test (`apps/dashboard/tests/marketing-claims.test.ts`) that greps the marketing sources for the phrases just removed. The test is written first and must be seen failing before the copy is edited — that is what proves the guard actually catches the claim. After all copy tasks, the SEO prerender cache is recaptured so crawlers see the corrected text.

**Tech Stack:** React 19 + Vite (`apps/dashboard`), Vitest, Playwright-based prerender capture, Icelandic copy.

## Global Constraints

- **Approved USP list — copy must not exceed these claims:** 550 kr. CPM, category buying, no third-party cookies, 80/20 split, monthly payouts ≥ 5.000 kr., viewability-counted impressions.
- **Banned claims:** publisher/site counts or wording implying an established large network, "sjálfvirkar útgreiðslur" (automatic payouts), bookkeeping-integration claims.
- **All user-facing copy is Icelandic.** Preserve the existing voice and formality; these are corrections, not rewrites. Do not translate or restyle surrounding sentences.
- **Never hardcode a number that exists in `@ada/shared`.** 550, 20/80, 5000, 24%, and the IAB sizes must keep coming from `FLAT_CPM_ISK`, `DEFAULT_PLATFORM_FEE_PERCENT`, `MIN_PAYOUT_ISK`, `VAT_RATE`, `IAB_STANDARD_SIZES`.
- **Verified system facts to write copy against:**
  - Advertiser self-registration is CLOSED (`apps/dashboard/src/pages/RoleSelect.tsx:23`, `REGISTRATION_CLOSED = true`). Every advertiser CTA leads to a waitlist. No copy may promise an immediate signup or campaign creation.
  - Advertiser/publisher **statistics** come from the hourly `cron-aggregate` (`apps/api/vercel.json`, `"0 * * * *"`). Lag up to ~1 hour. Not real-time.
  - The **category inventory forecast** (`GET /v1/categories/inventory`) IS computed live per request. "Rauntíma birtingaspá" is therefore TRUE and must be left alone.
  - **Spend accrual** runs every 15 minutes (`/api/cron-accrue`).
  - **Payouts:** monthly cron creates a `pending` payout; the bank transfer is completed manually by an admin. No guaranteed date may be promised.
  - **No invoice-generation code exists** anywhere in `apps/api`. No copy may claim an invoice is issued.
  - **Serving sets no cookies** (fixed 2026-07-29). "Engar vafrakökur" / "kökulaust" about the ad system is now TRUE — do not weaken these. Only absolute _personal-data_ claims need softening.
  - Current serving deploy is **Vercel**; Cloudflare Workers is the unshipped V2.
  - Built snippet is **3,105 bytes** (`packages/snippet/dist/snippet.js`), served as `snippet.js`, not `widget.js`.
- **Gate before every commit:** `pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm --filter @ada/dashboard test`.
- **Do not touch** `docs/superpowers/plans/2026-06-02-03-snippet-serving.md` — it is a historical record of a past design.

---

## File Structure

| File                                                                 | Responsibility                                                            | Task |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| `apps/dashboard/tests/marketing-claims.test.ts`                      | **Create.** Single regression guard; grows one `describe` block per task. | 1–5  |
| `apps/dashboard/src/pages/TermsPage.tsx`                             | Legal/contractual claims (highest risk).                                  | 1    |
| `apps/dashboard/src/lib/blog-data.ts`                                | Four SEO handbook guides.                                                 | 2    |
| `apps/dashboard/src/pages/BlogPost.tsx`                              | Shared CTA under every guide.                                             | 2    |
| `apps/dashboard/src/pages/LandingPage.tsx`                           | Homepage + its SEO meta description.                                      | 3    |
| `apps/dashboard/src/pages/AdvertiserLanding.tsx`                     | Advertiser landing.                                                       | 3    |
| `apps/dashboard/src/pages/{Bjarni,Serfraedingar,Tryggvi,Vibers}.tsx` | Unlisted prospect pitch pages.                                            | 4    |
| `apps/dashboard/prerender/snapshots.json`                            | Committed SEO snapshot cache.                                             | 5    |

---

### Task 1: Terms page — remove unsupported legal and contractual claims

Highest priority: these are contractual representations, not marketing copy. Three of them describe systems that do not exist.

**Files:**

- Create: `apps/dashboard/tests/marketing-claims.test.ts`
- Modify: `apps/dashboard/src/pages/TermsPage.tsx`

**Interfaces:**

- Produces: `apps/dashboard/tests/marketing-claims.test.ts` with an exported helper `readSource(relativePath: string): string` that later tasks reuse to load a source file as text.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/tests/marketing-claims.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Loads a dashboard source file as raw text so we can assert on the copy it contains. */
export function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('TermsPage claims match the shipped system', () => {
  const terms = readSource('src/pages/TermsPage.tsx');

  it('does not claim a VAT sales invoice is issued as campaigns run', () => {
    // No invoice-generation code exists anywhere in apps/api.
    expect(terms).not.toContain('Lögbundinn sölureikningur');
  });

  it('does not promise a payout on the first business day of the month', () => {
    // cron-payouts only creates a pending payout; the transfer is manual.
    expect(terms).not.toContain('fyrsta virka dag næsta mánaðar');
  });

  it('does not claim money moves in real time', () => {
    // Accrual runs on a 15-minute cron.
    expect(terms).not.toContain('í rauntíma samkvæmt CPM');
    expect(terms).not.toContain('safnast upp í rauntíma');
  });

  it('does not claim a pricing mode the system does not implement', () => {
    // CPM is locked server-side; createSlot ignores any client price.
    expect(terms).not.toContain('föstu verði');
  });

  it('does not claim every ad needs admin approval', () => {
    // auto_approved creatives skip human review entirely.
    expect(terms).not.toContain('þurfa samþykki kerfisstjóra');
  });

  it('names the embed script by its real filename', () => {
    expect(terms).not.toContain('widget.js');
    expect(terms).toContain('snippet.js');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @ada/dashboard test -- marketing-claims`
Expected: FAIL — six failing assertions, each naming the phrase still present in `TermsPage.tsx`.

- [ ] **Step 3: Fix the copy in `TermsPage.tsx`**

Apply these exact replacements. Keep all surrounding markup and `{' '}` spacing intact.

1. Receipt + invoice sentence (~line 68). Replace:
   `Við innborgun færðu senda kvittun fyrir innlögninni. Lögbundinn sölureikningur með 24% virðisaukaskatti (VSK) er gefinn út fyrir 20% umsýsluþóknun Birtings jafnóðum og herferðir eru birtar.`
   with:
   `Kvittun fyrir innlögninni er aðgengileg í stjórnborðinu. Umsýsluþóknun Birtings ber 24% virðisaukaskatt og sundurliðun þóknunar og VSK birtist í stjórnborðinu þínu.`

2. Charging sentence (~line 81–83). Replace:
   `Kostnaður er dreginn af inneign notanda í rauntíma samkvæmt CPM (kostnaður per 1.000 sýningar) eða samkvæmt föstu verði plássa`
   with:
   `Kostnaður er dreginn af inneign notanda samkvæmt CPM (kostnaður per 1.000 sýningar) og uppfærist á um 15 mínútna fresti`

3. Approval sentence (~line 76–77). Replace:
   `og þær þurfa samþykki kerfisstjóra áður en þær fara í birtingu`
   with:
   `og þær auglýsingar sem skönnunin merkir til skoðunar fara í handvirka yfirferð áður en þær birtast`

4. Snippet filename (~line 92–93). Replace `widget.js` with `snippet.js`.

5. Publisher accrual + payout sentence (~line 105–108). Replace:
   `Tekjur útgefanda safnast upp í rauntíma. Ef áunnin inneign nær <strong>5.000 kr.</strong>{' '} nettó greiðist hún út á skráðan bankareikning fyrsta virka dag næsta mánaðar.`
   with:
   `Tekjur útgefanda uppfærast á um 15 mínútna fresti. Ef áunnin inneign nær <strong>5.000 kr.</strong>{' '} nettó greiðist hún út með millifærslu á skráðan bankareikning í næsta mánaðarlega útgreiðsluferli.`

6. IP-storage sentence (~line 125). Replace:
   `IP-tölur eru aldrei vistaðar í gagnagrunni okkar heldur eru þær eingöngu notaðar í rauntíma`
   with:
   `IP-tölur eru ekki vistaðar í gagnagrunni okkar. Þær eru eingöngu notaðar í skammtímaminni, í mesta lagi eina klukkustund, til varnar gegn svikum og`

   (Reason: `apps/serving/src/lib/fraud.ts` uses the raw IP as a Redis key with a 30-second and a 1-hour TTL, so "aldrei vistaðar" was too absolute.)

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @ada/dashboard test -- marketing-claims`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm --filter @ada/dashboard test
git add apps/dashboard/tests/marketing-claims.test.ts apps/dashboard/src/pages/TermsPage.tsx
git commit -m "fix(marketing): remove unsupported invoice, payout-date and approval claims from terms"
```

---

### Task 2: Handbook guides — remove a category and regions that do not exist

**Files:**

- Modify: `apps/dashboard/tests/marketing-claims.test.ts`
- Modify: `apps/dashboard/src/lib/blog-data.ts`
- Modify: `apps/dashboard/src/pages/BlogPost.tsx`

**Interfaces:**

- Consumes: `readSource` from Task 1.

- [ ] **Step 1: Write the failing test**

Append to `apps/dashboard/tests/marketing-claims.test.ts`:

```typescript
import { AD_CATEGORIES, GEO_REGIONS } from '@ada/shared';

describe('Handbook guides describe real product capabilities', () => {
  const guides = readSource('src/lib/blog-data.ts');
  const blogPost = readSource('src/pages/BlogPost.tsx');

  it('offers no ad category that does not exist', () => {
    expect(AD_CATEGORIES.map((c) => c.slug)).not.toContain('fasteignir');
    expect(guides).not.toContain('fasteignir');
  });

  it('offers no geographic region that does not exist', () => {
    const regionNames = GEO_REGIONS.map((r) => r.toLowerCase());
    expect(regionNames).not.toContain('nordurland');
    expect(guides).not.toContain('Norðurland');
    expect(guides).not.toContain('Vesturland');
  });

  it('does not claim statistics are real-time', () => {
    expect(guides).not.toContain('smelli í rauntíma');
  });

  it('does not promise an immediate signup while registration is closed', () => {
    expect(guides).not.toContain('á 1 mínútu');
    expect(blogPost).not.toContain('á 3 mínútum');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @ada/dashboard test -- marketing-claims`
Expected: FAIL on the `fasteignir`, `Norðurland`, `rauntíma` and signup assertions.

- [ ] **Step 3: Fix the copy**

In `apps/dashboard/src/lib/blog-data.ts`:

1. Line ~53. Replace:
   `Þú einfaldlega velur flokk (t.d. matur, bílar, fasteignir) eða landshluta (t.d. Norðurland, Vesturland)`
   with:
   `Þú einfaldlega velur flokk (t.d. matur, bílar, tækni) eða svæði (t.d. höfuðborgarsvæðið eða Akureyri)`

2. Line ~174. Replace:
   `'Þú skráir þig inn á vefnum á 1 mínútu.',`
   with:
   `'Þú skráir þig á biðlista og kemst inn um leið og opnað er fyrir nýja auglýsendur.',`

3. Line ~177. Replace:
   `'Herferðin fer í loftið og þú sérð birtingar og smelli í rauntíma.',`
   with:
   `'Herferðin fer í loftið og þú fylgist með birtingum og smellum, sem uppfærast á klukkustundar fresti.',`

4. Line ~138. Replace:
   `Við söfnum engum persónulegum gögnum og`
   with:
   `Við söfnum ekki persónugreinanlegum upplýsingum um lesendur og`

   (Reason: the cookie claim in this sentence is now true and stays; only the absolute personal-data claim is narrowed.)

In `apps/dashboard/src/pages/BlogPost.tsx` line ~149, replace:
`Stofnaðu aðgang á 3 mínútum og sjáðu muninn.`
with:
`Skráðu þig á biðlista og við höfum samband um leið og opnað er.`

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @ada/dashboard test -- marketing-claims`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm --filter @ada/dashboard test
git add apps/dashboard/tests/marketing-claims.test.ts apps/dashboard/src/lib/blog-data.ts apps/dashboard/src/pages/BlogPost.tsx
git commit -m "fix(marketing): correct nonexistent category, regions and signup promise in handbook guides"
```

---

### Task 3: Landing pages — real-time statistics and the homepage search snippet

The meta description on line 84 of `LandingPage.tsx` is what Google displays, so it is the highest-traffic false claim on the site.

**Files:**

- Modify: `apps/dashboard/tests/marketing-claims.test.ts`
- Modify: `apps/dashboard/src/pages/LandingPage.tsx`
- Modify: `apps/dashboard/src/pages/AdvertiserLanding.tsx`

**Interfaces:**

- Consumes: `readSource` from Task 1.

- [ ] **Step 1: Write the failing test**

Append to `apps/dashboard/tests/marketing-claims.test.ts`:

```typescript
describe('Landing pages describe statistics honestly', () => {
  const landing = readSource('src/pages/LandingPage.tsx');
  const advertiser = readSource('src/pages/AdvertiserLanding.tsx');

  it('does not claim impressions and clicks are visible in real time', () => {
    expect(landing).not.toContain('smelli í rauntíma');
    expect(advertiser).not.toContain('smelli í rauntíma');
  });

  it('does not promise a 3-minute campaign while registration is closed', () => {
    expect(landing).not.toContain('3 mín');
  });

  // The category inventory forecast IS computed live per request, so this
  // wording is accurate and must survive the cleanup.
  it('keeps the accurate real-time forecast claim', () => {
    expect(landing).toContain('Rauntíma birtingaspá');
    expect(advertiser).toContain('Rauntíma birtingaspá');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @ada/dashboard test -- marketing-claims`
Expected: FAIL on the real-time and "3 mín" assertions; the forecast assertion should already PASS.

- [ ] **Step 3: Fix the copy**

In both `LandingPage.tsx` (line ~54) and `AdvertiserLanding.tsx` (line ~43), replace the identical `desc` string:
`'Sjáðu birtingar og smelli í rauntíma og fínstilltu herferðina hvenær sem er — beint úr stjórnborðinu þínu.'`
with:
`'Fylgstu með birtingum og smellum — tölur uppfærast á klukkustundar fresti — og fínstilltu herferðina hvenær sem er, beint úr stjórnborðinu þínu.'`

In `LandingPage.tsx` line ~84, replace the tail of the meta description:
`Stofnaðu herferð á 3 mín!`
with:
`Skráðu þig á biðlista.`

Leave `LandingPage.tsx:423` and `AdvertiserLanding.tsx:33,62` untouched — those describe the live inventory forecast and are accurate.

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @ada/dashboard test -- marketing-claims`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm --filter @ada/dashboard test
git add apps/dashboard/tests/marketing-claims.test.ts apps/dashboard/src/pages/LandingPage.tsx apps/dashboard/src/pages/AdvertiserLanding.tsx
git commit -m "fix(marketing): stop claiming real-time stats and a 3-minute signup on landing pages"
```

---

### Task 4: Prospect pitch pages — infrastructure, benchmark and third-party claims

These four pages (`/bjarni`, `/serfraedingar`, `/tryggvi`, `/datera`, `/vibers`) are publicly reachable but absent from `sitemap.xml`, so they need no prerender recapture. They contain the only fabricated third-party data on the site.

**Files:**

- Modify: `apps/dashboard/tests/marketing-claims.test.ts`
- Modify: `apps/dashboard/src/pages/Bjarni.tsx`
- Modify: `apps/dashboard/src/pages/Serfraedingar.tsx`
- Modify: `apps/dashboard/src/pages/Tryggvi.tsx`
- Modify: `apps/dashboard/src/pages/Vibers.tsx`

**Interfaces:**

- Consumes: `readSource` from Task 1.

- [ ] **Step 1: Write the failing test**

Append to `apps/dashboard/tests/marketing-claims.test.ts`:

```typescript
describe('Prospect pages make no unsupported claims', () => {
  const pages = ['Bjarni', 'Serfraedingar', 'Tryggvi', 'Vibers'].map((name) => ({
    name,
    source: readSource(`src/pages/${name}.tsx`),
  }));

  const each = (assert: (source: string, name: string) => void) =>
    pages.forEach(({ source, name }) => assert(source, name));

  it('does not present Cloudflare Workers as the live serving stack', () => {
    // apps/serving currently deploys to Vercel; Cloudflare is the unshipped V2.
    each((source, name) => expect(source, name).not.toContain('Cloudflare Workers'));
  });

  it('quotes no unbenchmarked latency figure', () => {
    each((source, name) => expect(source, name).not.toContain('15ms'));
  });

  it('quotes no invented CTR benchmark', () => {
    // Nothing in apps/api computes a platform-wide CTR average.
    each((source, name) => expect(source, name).not.toContain('1.8%'));
  });

  it('does not promise a 3-minute signup while registration is closed', () => {
    each((source, name) => expect(source, name).not.toContain('3 mínútum'));
  });

  it('does not claim statistics are real-time', () => {
    each((source, name) => expect(source, name).not.toContain('Rauntíma'));
    each((source, name) => expect(source, name).not.toContain('rauntíma tölfræði'));
  });

  it('states the real built size of the embed snippet', () => {
    // packages/snippet/dist/snippet.js is 3,105 bytes.
    expect(readSource('src/pages/Vibers.tsx')).not.toContain('1.5 KB');
  });

  it('shows no fabricated data attributed to a named company', () => {
    // Tryggvi.tsx is served at /tryggvi and /datera; naming another live
    // prospect in a fake API response exposes one client to another.
    expect(readSource('src/pages/Tryggvi.tsx')).not.toContain('"Vibers"');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @ada/dashboard test -- marketing-claims`
Expected: FAIL on every assertion above.

- [ ] **Step 3: Fix the copy**

`Bjarni.tsx`:

- Line ~179: replace `Auglýsendur búa til herferð á 3 mínútum, velja` with `Auglýsendur setja upp herferð í nokkrum skrefum, velja`.
- Lines ~397 and ~417 (two copies of the same comparison row): replace `'Sjálfvirk á 3 mínútum'` with `'Sjálfvirk uppsetning í vefviðmóti'`.
- Line ~447: replace `Vörumerkið þitt getur verið live á niche-netinu okkar á 3 mínútum.` with `Vörumerkið þitt getur farið í loftið á sérhæfðum íslenskum vefjum um leið og opnað er fyrir nýja auglýsendur.` (also removes the banned network-scale phrasing).
- Line ~448: replace `horfðu á rauntíma tölfræði` with `fylgstu með tölfræði sem uppfærist á klukkustundar fresti`.
- Line ~261: replace `Rauntíma dashboard fyrir báða aðila.` with `Sameiginlegt stjórnborð fyrir báða aðila.`
- Lines ~193–194: replace the `Hono + Cloudflare Workers` / `<15ms p99` pair with `Hono á Vercel` and `Svarhraði mældur á beiðni`.
- Lines ~399 and ~419: replace `'REST API, <15ms, IAB viewability'` with `'REST API og IAB-staðfest sýnileikamæling'`.
- Line ~466: remove the `<15ms` statistic tile and its label entirely, keeping the surrounding grid valid.
- Line ~368: replace `Allar auglýsingamyndir eru sjálfkrafa skannaðar af Gemini Vision.` with `Auglýsingamyndir fara í sjálfvirka AI-skönnun fyrir birtingu.` (the Gemini path falls back to a stub without `GEMINI_API_KEY`).

`Serfraedingar.tsx`:

- Line ~277: replace `Sjálfvirk á 3 mínútum beint úr viðmótinu` with `Sjálfvirk uppsetning beint úr viðmótinu`.
- Line ~306: replace `fylgst með rauntíma` with `fylgst með tölfræði sem uppfærist á klukkustundar fresti,` and repair the sentence that continues on the following line.
- Lines ~314–315: remove the `1.8% - 2.5%` CTR statistic tile and its label.
- Lines ~322–323: remove the `15ms` statistic tile and its label.

`Tryggvi.tsx`:

- Lines ~213–214: replace `keyra á <strong>Hono + Cloudflare Workers</strong> sem tryggir{' '}<strong>&lt;15ms serving</strong> á Edge-inu á Íslandi.` with `keyra á <strong>Hono</strong> á Vercel Edge og skila auglýsingum ósamstillt.`
- Line ~190: replace `rauntíma auglýsingabirtingar og sjálfvirkt net` with `sjálfvirkar auglýsingabirtingar og net`.
- Line ~262: replace `Þetta gefur miklu meira CTR (meðaltal 1.8%) og meiri athygli fyrir herferðirnar.` with `Þetta gefur að jafnaði meiri athygli fyrir herferðirnar.`
- Line ~486: replace `Rauntímatölfræði (Impressions, Clicks, CTR, CPM) deilt með API.` with `Tölfræði (Impressions, Clicks, CTR, CPM) aðgengileg gegnum API, uppfærð á klukkustundar fresti.`
- Lines ~300–345: in the mock API response block, replace the endpoint `GET /v1/slots?category=technology` with `GET /v1/categories/inventory`, replace `"publisher": "Vibers"` with `"category": "taekni"`, and delete the `"monthlyImpressions": 250000` line. Keep `"cpmRate": 550` only if it is rendered from `FLAT_CPM_ISK`; otherwise delete it too.

`Vibers.tsx`:

- Line ~210: replace `er undir <strong>1.5 KB</strong> og hleðst async` with `er undir <strong>4 KB</strong> og hleðst async`.
- Line ~211–212: replace `Engin seinkun, engin SEO-refsing.` with `Skriftan blokkar ekki síðuhleðslu og fellur hljóðlega niður eftir 2 sekúndur ef ekkert svar berst.`
- Lines ~390–391: replace `Við sjáum um allt: innheimtu, Gemini AI skönnun, greiðslukerfi og tölfræði.` with `Við sjáum um AI-skönnun, greiðslugátt og tölfræði.` (there is no invoicing implementation).

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @ada/dashboard test -- marketing-claims`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
pnpm --filter @ada/dashboard typecheck && pnpm --filter @ada/dashboard lint && pnpm --filter @ada/dashboard test
git add apps/dashboard/tests/marketing-claims.test.ts apps/dashboard/src/pages/Bjarni.tsx apps/dashboard/src/pages/Serfraedingar.tsx apps/dashboard/src/pages/Tryggvi.tsx apps/dashboard/src/pages/Vibers.tsx
git commit -m "fix(marketing): correct infrastructure, benchmark and third-party claims on prospect pages"
```

---

### Task 5: Recapture the SEO prerender cache

Tasks 1–3 changed copy on sitemap routes. Until the snapshot cache is recaptured, crawlers and AI crawlers keep serving the old, false text — the corrections are invisible where they matter most.

**Files:**

- Modify: `apps/dashboard/prerender/snapshots.json`
- Modify: `apps/dashboard/public/llms.txt` (only if any claim corrected above is repeated there)

- [ ] **Step 1: Check `llms.txt` for the same claims**

Run: `grep -n "rauntíma\|3 mín\|fasteignir\|Norðurland\|sölureikning\|fyrsta virka dag" apps/dashboard/public/llms.txt`
If any line matches, apply the same replacement wording used in Tasks 1–3. This file is consumed by AI crawlers, so a falsehood here propagates into AI answers about the product.

- [ ] **Step 2: Recapture the snapshots**

Run: `pnpm --filter @ada/dashboard prerender:capture`
Expected: the script renders every route in `public/sitemap.xml` and rewrites `prerender/snapshots.json`.

- [ ] **Step 3: Verify the corrected copy is actually in the cache**

Run: `grep -c "Stofnaðu herferð á 3 mín" apps/dashboard/prerender/snapshots.json`
Expected: `0`.

Run: `grep -c "fasteignir" apps/dashboard/prerender/snapshots.json`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/prerender/snapshots.json apps/dashboard/public/llms.txt
git commit -m "chore(marketing): recapture prerender snapshots after claim corrections"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full repository gate**

Run: `pnpm verify`
Expected: PASS (format:check, typecheck, lint across all workspaces).

- [ ] **Step 2: Full dashboard build**

Run: `pnpm --filter @ada/dashboard build`
Expected: PASS, including the `prerender-apply.mjs` step.

- [ ] **Step 3: Confirm the guard actually guards**

Temporarily reintroduce one removed phrase (for example, put `fasteignir` back into `blog-data.ts`), run `pnpm --filter @ada/dashboard test -- marketing-claims`, confirm it FAILS, then revert the edit. A guard nobody has seen fail is not a guard.

- [ ] **Step 4: Commit any residual changes and summarise**

```bash
git add -A && git commit -m "chore(marketing): close out claims-truthfulness pass"
```

---

## Decisions the owner must make (not covered by the tasks above)

These were found in the audit but must not be "fixed" by an engineer guessing.

1. **GDPR and legal claims in the cookieless handbook guide** (`blog-data.ts` lines ~120, ~131) assert what European and Icelandic law requires and that no consent banner is needed. Claude cannot validate legal claims. Get these confirmed by a lawyer or soften them before the guide keeps running.
2. **Comparative claims about media agencies** (`blog-data.ts` guide 4, `Bjarni.tsx` and `Serfraedingar.tsx` comparison tables) characterise competitors' cost, speed and reporting without a source. Either cite a source or soften. Uncited disparagement of an identifiable industry carries some legal risk.
3. **Uncited market statistics** — "yfir 50% notenda hafna þessum kökum", "8–12 auglýsingar á hverri síðu", and the claim that Chrome now blocks third-party cookies (Google reversed that plan publicly). Each needs a citation or removal.
4. **Network-scale framing** — several pages imply an established network of well-known Icelandic sites, while `RoleSelect.tsx` tells visitors inventory is still being gathered and the documented strategy targets long-tail niche blogs. Decide which story is true and make every page tell that one.
5. **Whether to reopen advertiser registration.** Every "3 mínútum" correction in this plan assumes registration stays closed. If it reopens, revisit Tasks 2–4 rather than reverting them wholesale.
6. **The affiliate/revenue-share offer** on `Vibers.tsx` (~line 194) has no implementation. Fine as a sales conversation, misleading as a listed feature.

## Self-review

- **Spec coverage:** Every BLOCK/FALSE finding from the 2026-07-29 audit maps to a task — Terms (1), handbook (2), landings (3), prospect pages (4), prerender staleness (5). Cookie findings are already resolved in code and are asserted as must-keep in Task 3's guard rather than re-fixed.
- **Placeholder scan:** No TBDs; every copy change gives exact before/after Icelandic text and every step gives a runnable command.
- **Type consistency:** `readSource` is defined once in Task 1 and consumed by Tasks 2–4 with the same signature.
