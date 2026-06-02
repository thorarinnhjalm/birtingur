# Icelandic Ad Platform — UI Design Spec

**Date:** 2026-06-02
**Companion to:** `2026-06-02-icelandic-ad-platform-design.md`
**Purpose:** Exhaustive functional UI specification covering every screen, state, and component across the three user surfaces (Advertiser, Publisher, Admin). Designed to be consumed directly by implementation agents or by visual design tools (Stitch, Figma) as a structured brief.

---

## 1. Design System Foundations

### 1.1 Visual language

- **Tone:** Clean, modern, trustworthy. Slightly editorial. Functional density without feeling cramped.
- **Primary accent:** Deep blue `#1e3a8a` (Tailwind `blue-900`). Hover: `#1e40af` (`blue-800`). Active: `#1d4ed8` (`blue-700`).
- **Secondary accent:** Sky blue `#0ea5e9` for informational highlights, links.
- **Success:** `#16a34a` (green-600). **Warning:** `#ca8a04` (yellow-600). **Danger:** `#dc2626` (red-600).
- **Background:** White `#ffffff` page background. Section/card background `#f8fafc` (slate-50). Card border `#e2e8f0` (slate-200).
- **Text:** Primary `#0f172a` (slate-900). Secondary `#475569` (slate-600). Muted `#94a3b8` (slate-400).
- **Typography:** Inter (system fallback: -apple-system, Segoe UI, sans-serif). Sizes: 12 / 14 / 16 / 18 / 20 / 24 / 32. Headings semi-bold, body regular.
- **Radius:** 12px for cards, 8px for buttons/inputs, 6px for small chips.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- **Shadow:** Low-elevation `0 1px 2px rgba(0,0,0,0.05)`. Hover lift `0 4px 12px rgba(0,0,0,0.08)`.

### 1.2 Layout primitives

- **Page width:** 1280px content area max; full-width nav and footer.
- **Sidebar nav (advertiser, publisher, admin):** 240px fixed left, white, top-aligned logo, list of nav items with icon + label.
- **Main content padding:** 32px on desktop, 16px on mobile.
- **Mobile:** Single-column. Sidebar collapses to top hamburger menu. Tables become stacked cards.

### 1.3 Localization

- **Default locale:** Icelandic (is).
- **All UI copy in this spec is shown in Icelandic.** Implementation should use i18n keys; English fallback is acceptable but not user-facing in V1.
- **Currency:** ISK formatted as `1.000 kr` (period thousand-separator, "kr" suffix with space). No decimals on ISK.
- **Dates:** `dd.MM.yyyy` (e.g., `02.06.2026`). Relative dates ("í dag", "í gær", "fyrir 3 dögum") where appropriate.
- **Numbers >1000:** Period as thousand-separator (`1.500.000`).

### 1.4 Shared components

- **PrimaryButton:** Blue-900 bg, white text, 12px vertical / 20px horizontal padding, semibold, 8px radius. Hover: blue-800. Disabled: slate-300.
- **SecondaryButton:** White bg, blue-900 border, blue-900 text, same dimensions.
- **GhostButton:** Transparent bg, slate-600 text, hover slate-100 bg.
- **Card:** White bg, slate-200 border, 12px radius, 24px padding.
- **StatCard:** Card with label (uppercase, 12px, slate-500) + large number (32px, slate-900) + optional delta (`↑ 12% frá síðasta mánuði`, green or red).
- **Input:** White bg, slate-300 border, 8px radius, 12px vertical / 16px horizontal padding. Focus: blue-900 ring.
- **Modal:** Centered, 600px wide on desktop, white bg, 16px radius, backdrop slate-900/60.
- **Toast:** Bottom-right, 320px wide, slate-900 bg, white text, auto-dismiss 4s.
- **Badge:** Pill, 12px text, semibold. Variants: `success` (green-100 bg, green-800 text), `pending` (yellow-100 bg, yellow-800 text), `danger` (red-100 bg, red-800 text), `info` (blue-100 bg, blue-800 text), `neutral` (slate-100 bg, slate-700 text).
- **EmptyState:** Centered icon (slate-400, 48px), heading (slate-900, 18px semibold), description (slate-600, 14px), optional CTA button.
- **LoadingState:** Skeleton blocks for cards/lists. Spinner only for inline async actions inside buttons.
- **ErrorState:** Red-50 bg banner with red-600 icon + heading + description + "Reyna aftur" button.

### 1.5 Universal states (apply to every page)

Every data-driven view must explicitly handle:
- **Loading** — skeleton or spinner
- **Empty** — first-use prompt with CTA
- **Error** — retryable banner
- **Success** — happy path
- **Partial** — some data loaded, some still loading (table rows fade in progressively)

---

## 2. Common Patterns

### 2.1 Authentication

Hosted dashboard uses Firebase Auth. V1 supports:
- Google OAuth
- Email + password

**Sign-in screen:**
```
┌──────────────────────────────────────────────┐
│                                              │
│              [Logo: adplatform.is]           │
│                                              │
│         Skráðu þig inn til að halda          │
│              áfram                           │
│                                              │
│   ┌────────────────────────────────────┐    │
│   │  [G]  Halda áfram með Google       │    │
│   └────────────────────────────────────┘    │
│                                              │
│             ──────── eða ────────            │
│                                              │
│   Netfang                                    │
│   ┌────────────────────────────────────┐    │
│   │ jon@example.is                     │    │
│   └────────────────────────────────────┘    │
│                                              │
│   Lykilorð                                   │
│   ┌────────────────────────────────────┐    │
│   │ ••••••••                           │    │
│   └────────────────────────────────────┘    │
│                                              │
│   ┌────────────────────────────────────┐    │
│   │           Skrá inn                  │    │
│   └────────────────────────────────────┘    │
│                                              │
│   Ertu ekki með aðgang? Skráðu þig nýjan    │
│                                              │
└──────────────────────────────────────────────┘
```

### 2.2 Role selection (first login)

After sign-up, ask:
> "Ertu auglýsandi eða ert þú með vef?"
- **Card 1:** "Ég vil birta auglýsingar" → Advertiser onboarding
- **Card 2:** "Ég er með vef og vil selja pláss" → Publisher onboarding
- **Both:** small link "Ég er bæði" → set up both, defaults to most-recently-used surface

### 2.3 Navigation

**Advertiser sidebar:**
- Yfirlit (Dashboard) [home icon]
- Herferðir (Campaigns) [megaphone icon]
- Veski (Wallet) [wallet icon]
- Auglýsingaefni (Creatives) [image icon]
- Stillingar (Settings) [gear icon]

**Publisher sidebar:**
- Yfirlit (Dashboard) [home icon]
- Auglýsingapláss (Slots) [grid icon]
- Tekjur (Earnings) [currency icon]
- Samþykktir (Approvals) [check-circle icon] — only if any slot requires manual approval
- Stillingar (Settings) [gear icon]

**Admin sidebar:**
- Yfirlit (Overview) [home]
- Yfirferð (Review queue) [shield-check]
- Útborganir (Payouts) [bank]
- Útgefendur (Publishers) [users]
- Auglýsendur (Advertisers) [building]
- Tölfræði (Stats) [chart]
- Kerfi (System) [gear]

Top bar: workspace switcher (if user has both roles), notifications bell, account avatar with dropdown (profile, switch role, sign out).

---

## 3. Advertiser Surface

### 3.1 Advertiser onboarding (3 steps)

**Step 1 — Company info:**
```
┌─────────────────────────────────────────────┐
│  Stofna auglýsendaaðgang        [1 / 3]     │
├─────────────────────────────────────────────┤
│                                             │
│  Fyrirtækisnafn *                           │
│  [_______________________]                  │
│                                             │
│  Kennitala *                                │
│  [_______________________]                  │
│                                             │
│  VSK-númer *                                │
│  [_______________________]                  │
│                                             │
│  Netfang reikningsgreiðanda                 │
│  [_______________________]                  │
│                                             │
│                       [Næsta skref →]       │
└─────────────────────────────────────────────┘
```

**Step 2 — Accept terms:**
- Skilmálar checkbox
- DPA/persónuvernd link
- "Ég samþykki" button

**Step 3 — First top-up nudge:**
- "Þú ert kominn af stað! Settu inn inneign til að byrja að birta auglýsingar."
- [Setja inn inneign] primary button → top-up flow
- [Sleppa, byrja á herferð fyrst] ghost link

### 3.2 Advertiser dashboard (home)

```
┌──────────────────────────────────────────────────────────────┐
│  Yfirlit                                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────┐              │
│  │  VESKI                                     │              │
│  │  47.250 kr                                 │              │
│  │  [+ Setja inn inneign]                     │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ BIRTINGAR   │ │ SMELLIR     │ │ CTR         │            │
│  │ 12.450      │ │ 87          │ │ 0,70%       │            │
│  │ ↑ 24%       │ │ ↑ 18%       │ │ ↓ 0,05pp    │            │
│  │ frá fyrra   │ │ frá fyrra   │ │ frá fyrra   │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
│                                                              │
│  Virkar herferðir                  [+ Ný herferð]            │
│  ─────────────────────────────────────────────────           │
│  ┌──────────────────────────────────────────┐                │
│  │ [thumb] Sumartilboð 2026     [Virk]      │                │
│  │         3 vefir · 5.450 / 20.000 kr      │                │
│  │         ████████░░░░░░░░░░░  27%         │                │
│  └──────────────────────────────────────────┘                │
│  ┌──────────────────────────────────────────┐                │
│  │ [thumb] Vörukynning júní      [Bíður]    │                │
│  │         1 vefur · samþykktar bíður       │                │
│  └──────────────────────────────────────────┘                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Empty state (no campaigns):**
- Icon: megaphone
- Heading: "Engin herferð enn"
- Description: "Byrjaðu með því að setja inn inneign og búa til þína fyrstu auglýsingaherferð."
- CTA: [Setja inn inneign] + [Búa til herferð]

### 3.3 Top-up wallet flow

**Modal:**
```
┌─────────────────────────────────────────────┐
│  Setja inn inneign                    [×]   │
├─────────────────────────────────────────────┤
│                                             │
│  Veldu upphæð                               │
│                                             │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐  │
│  │ 5.000 │ │20.000 │ │50.000 │ │100.000│  │
│  │  kr   │ │  kr   │ │  kr   │ │  kr   │  │
│  └───────┘ └───────┘ └───────┘ └───────┘  │
│                                             │
│  Önnur upphæð:                              │
│  [____________] kr                          │
│                                             │
│  ────────────────────────────────────────   │
│  Upphæð          20.000 kr                  │
│  Þar af VSK       3.871 kr                  │
│  Heildargreiðsla 20.000 kr                  │
│                                             │
│  Greitt í gegnum Teya · íslensk kort        │
│                                             │
│  [Hætta við]            [Greiða með korti]  │
└─────────────────────────────────────────────┘
```

**On submit:** Redirect to Teya hosted checkout. On return (success):
- Toast: "Inneign uppfærð: +20.000 kr"
- Dashboard wallet card updates with new balance

**On return (failure):**
- Toast: "Greiðsla mistókst. Reyndu aftur eða notaðu annað kort."
- Wallet balance unchanged

### 3.4 Create campaign — 4-step wizard

**Step 1 — Basics:**
- Herferðarnafn (input)
- Tímabil (start date picker, end date picker)
- "Heildarfjárhagsáætlun" (number input, ISK) — only for CPM mode
- Helper text: "Þú getur stöðvað eða breytt herferðinni hvenær sem er"

**Step 2 — Auglýsingaefni:**
- Drag-drop zone: "Dragðu mynd hingað eða [veldu skrá]"
- Supported: PNG, JPG, ≤2 MB
- Preview after upload, with detected size shown
- Click URL input with URL validation
- Show real-time auto-scan progress: "Athugum auglýsinguna..." → "Samþykkt" badge or "Bíður yfirferðar" badge

**Step 3 — Auglýsingapláss:**
```
┌────────────────────────────────────────────────┐
│  Veldu pláss              [3 valin]            │
├────────────────────────────────────────────────┤
│  Sía:                                          │
│  [Stærð ▼] [Flokkur ▼] [Landshluti ▼] [CPM ▼] │
│                                                │
│  ☑ markadssetning.is · Forsíða leaderboard    │
│    728×90 · CPM 1.500 kr                       │
│  ☑ kjarninn.is · Greinasíða sidebar           │
│    300×600 · Slot 25.000 kr / vika             │
│  ☑ heimildin.is · In-content                  │
│    600×200 · CPM 2.000 kr                      │
│  ☐ visir.is · Toppborði                       │
│    980×120 · Slot 80.000 kr / vika             │
│                                                │
│  Áætlaðar birtingar: ~8.500 á viku             │
└────────────────────────────────────────────────┘
```

**Step 4 — Yfirlit og staðfesting:**
- Summary of all selections
- Total cost (slot purchases summed + estimated CPM cost from budget)
- Warning if wallet balance < total cost: "Veski inniheldur 15.000 kr — þú þarft að setja inn 10.000 kr í viðbót áður en herferðin getur byrjað."
- [Senda til samþykktar] primary button

**Post-submit:** Redirect to campaign detail page. Status badge: "Bíður samþykktar" until auto-scan + any required publisher approvals clear.

### 3.5 Campaign detail

```
┌──────────────────────────────────────────────────────────────┐
│  Sumartilboð 2026                            [Virk]          │
│  02.06.2026 – 30.06.2026 · 3 vefir                           │
├──────────────────────────────────────────────────────────────┤
│  [Þagga] [Breyta] [Bæta inneign]                             │
│                                                              │
│  Eytt: 5.450 kr af 20.000 kr                                 │
│  ███████░░░░░░░░░░░░░░░░  27%                                │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Birtingar yfir tíma                                │    │
│  │  [line chart]                                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Frammistaða eftir vef                                       │
│  ┌──────────────────┬──────────┬────────┬──────┬────────┐  │
│  │ Vefur            │ Birtingar│ Smellir│ CTR  │ Eytt   │  │
│  ├──────────────────┼──────────┼────────┼──────┼────────┤  │
│  │ markadssetning.is│ 5.200    │ 42     │ 0,8% │ 2.100  │  │
│  │ kjarninn.is      │ 4.100    │ 28     │ 0,7% │ 2.050  │  │
│  │ heimildin.is     │ 3.150    │ 17     │ 0,5% │ 1.300  │  │
│  └──────────────────┴──────────┴────────┴──────┴────────┘  │
│                                                              │
│  Auglýsing                                                   │
│  [creative thumbnail preview]                                │
│  Smellurinn fer á: blomabud.is/sumartilbod                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.6 Creative library

- Grid view, 4 columns desktop, 2 columns mobile
- Each item: thumbnail + status badge + filename + uploaded date
- Click → modal with full preview, click URL, used-in-campaigns list, delete button (only if not in active use)
- "+ Hlaða upp" button top right
- Filter by status (All / Approved / Pending / Rejected)

**Rejected state on card:** Red badge "Hafnað" with hover tooltip showing reason.

### 3.7 Advertiser settings

- Company info (editable)
- Billing email
- Payment method (managed via Teya — shows last-4 of saved card if applicable)
- Notification preferences (email when: campaign approved, budget low, campaign completed)
- API keys (for service accounts — advanced, collapsible section)
- "Eyða aðgangi" danger button at bottom

---

## 4. Publisher Surface

### 4.1 Publisher onboarding (3 steps)

**Step 1 — Site info:**
- Lén (domain input with validation)
- Sýnilegt nafn (display name)
- "Aðalflokkur efnis" select (news, blog, niche, etc.)

**Step 2 — Útborganir:**
- Kennitala
- IBAN
- Reikningseigandi (account name)
- Lágmarksútborgun (default 5.000 kr, editable up to 50.000 kr)

**Step 3 — Fyrsta slot:**
- "Næst búum við til þitt fyrsta auglýsingapláss" → Continue to slot wizard

### 4.2 Publisher dashboard (home)

```
┌──────────────────────────────────────────────────────────────┐
│  Yfirlit                                                     │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────┐              │
│  │  TEKJUR Í JÚNÍ                             │              │
│  │  8.420 kr                                  │              │
│  │  Næsta útborgun: 01.07.2026                │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ BIRTINGAR   │ │ FYLLINGAR-  │ │ eCPM        │            │
│  │ 24.350      │ │ HLUTFALL    │ │ 1.840 kr    │            │
│  │ síðustu 30d │ │ 87%         │ │             │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
│                                                              │
│  Auglýsingapláss                       [+ Nýtt pláss]        │
│  ─────────────────────────────────────────────────           │
│  ┌──────────────────────────────────────────┐                │
│  │ Forsíða leaderboard         [Virkt]      │                │
│  │ 728×90 · CPM 1.500 kr                    │                │
│  │ Birtingar síðustu 7d: ▁▃▅▆▄▇█           │                │
│  └──────────────────────────────────────────┘                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Empty state:** "Þú ert ekki með nein pláss enn" + [Búa til pláss] CTA.

### 4.3 Slot creation wizard (5 steps)

**Step 1 — Nafn og staðsetning:**
- Nafn (input, e.g., "Forsíða leaderboard")
- "Hvar á þessu plássi á síðunni þinni?" select: Above the fold / Innan í greinum / Sidebar
- Page matcher (advanced): "Hvar á síðunni á að birta?" — radio group: Allar síður / Aðalsíða / Greinar / Sérstakar slóðir (input pattern)

**Step 2 — Stærðir:**
- Visual grid of IAB sizes (728×90, 300×250, 300×600, 320×100, 980×120) — multi-select with checkboxes
- Each size shown with proportional rectangle preview
- "+ Sérsniðin stærð" button → modal with width/height inputs
- Help text: "Þú getur valið margar stærðir. Vettvangurinn velur þá sem passar best þeirri auglýsingu sem á að birta."

**Step 3 — Verðlagning:**
- Radio: CPM / Tímabil
- **If CPM:** number input "Verð á 1.000 birtingar (kr)". Helper: "Markaðsverð á íslenskum miðlum er 1.000–3.000 kr CPM."
- **If Tímabil:** number input "Verð á viku (kr)" + select "Lágmarks-bókunartímabil" (1 vika / 2 vikur / 1 mánuður).

**Step 4 — Efnisstefna:**
```
Hvers konar auglýsingar viltu ekki sjá?
☑ Áfengi og tóbak
☑ Fjárhættuspil
☐ Stefnumótaþjónustur
☐ Pólitískar auglýsingar
☐ Trúarauglýsingar
☐ Lyf og heilbrigðisvörur

☐ Ég vil samþykkja hverja auglýsingu handvirkt
  (Sjáðu samþykktir í sérstökum flipa áður en þær birtast)
```

**Step 5 — Setja upp á vefnum:**
```
Þitt pláss er tilbúið! Límdu þennan kóða inn á síðuna þína 
þar sem þú vilt að auglýsingin birtist:

┌─────────────────────────────────────────────────────────┐
│  <div data-adplatform-slot="slot_abc123"                │
│       style="min-height:90px"></div>                    │
│  <script async                                          │
│    src="https://cdn.adplatform.is/v1/snippet.js">       │
│  </script>                                              │
└─────────────────────────────────────────────────────────┘
                                          [Afrita kóða]

Þarftu hjálp? [Skoðaðu uppsetningarleiðbeiningar]
```

### 4.4 Slot detail

- Performance chart (impressions over time, last 30d)
- eCPM trend
- Fill rate
- Recent ads served (thumbnails grid, click for advertiser + creative detail)
- Edit pricing / policy buttons
- "Sækja kóða aftur" button → opens snippet modal
- Pause/activate toggle
- Delete (only if no active campaigns booked)

### 4.5 Earnings page

```
┌──────────────────────────────────────────────────────────────┐
│  Tekjur                                                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────┐              │
│  │  Mánaðartekjur                              │              │
│  │  [bar chart, last 12 months]               │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  Útborganir                                                  │
│  ┌──────────┬──────────┬───────────┬───────┬──────────┐    │
│  │ Tímabil  │ Brúttó   │ Þóknun    │ Nettó │ Staða    │    │
│  ├──────────┼──────────┼───────────┼───────┼──────────┤    │
│  │ Maí 2026 │ 18.250kr │ 3.650 kr  │14.600 │[Greitt]  │    │
│  │ Apríl    │ 12.400kr │ 2.480 kr  │ 9.920 │[Greitt]  │    │
│  │ Mars     │  4.200kr │   840 kr  │ 3.360 │[Rúllaði] │    │
│  └──────────┴──────────┴───────────┴───────┴──────────┘    │
│                                                              │
│  Útborgunarupplýsingar                       [Breyta]        │
│  Kennitala: 123456-7890                                      │
│  IBAN: IS00 0000 0000 0000 0000 0000 00                      │
│  Lágmarksútborgun: 5.000 kr                                  │
└──────────────────────────────────────────────────────────────┘
```

**Status badges:** `Greitt` (green), `Í vinnslu` (yellow), `Bíður` (slate), `Rúllaði í næsta mánuð` (slate, with tooltip "Upphæð undir lágmarki").

### 4.6 Approval queue (publisher)

Only shown if any slot has `requireManualApproval=true`.

```
┌──────────────────────────────────────────────────────────────┐
│  Samþykktir                            3 bíða samþykktar     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [creative preview rendered at actual slot size]      │   │
│  │                                                      │   │
│  │ Auglýsandi: Blómabúð Vesturbæjar                    │   │
│  │ Flokkur: Smásala                                     │   │
│  │ Smellur fer á: blomabud.is/sumartilbod              │   │
│  │ Birtast á: Forsíða leaderboard (728×90)             │   │
│  │ Tímabil: 02.06–15.06.2026                            │   │
│  │                                                      │   │
│  │ [Hafna]                              [Samþykkja]    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [next creative ...]                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**On reject:** modal asks for optional reason (free text, max 200 chars). Default reasons in dropdown: "Passar ekki ritstjórnarstefnu", "Tæknileg gæði ófullnægjandi", "Annað".

### 4.7 Publisher settings

- Site info (editable)
- Payout details (editable)
- Default content policy (applies to new slots; existing slots unchanged)
- Notification preferences
- API keys (for embed widgets)
- DPA download link
- "Eyða aðgangi" danger button

---

## 5. Admin Surface

### 5.1 Admin overview

Operational summary, denser than user-facing pages.

```
┌──────────────────────────────────────────────────────────────┐
│  Yfirlit                                              Í dag  │
├──────────────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │BIRT. │ │TEKJUR│ │ ÞÓKN.│ │P95 LT│ │HEALTH│              │
│  │ 45k  │ │ 124k │ │ 24,8k│ │ 38ms │ │  OK  │              │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘              │
│                                                              │
│  Athyglisvert                                                │
│  ⚠ 7 auglýsingar bíða handvirkrar yfirferðar (eldri en 4klst)│
│  ⚠ 2 útborganir bíða vinnslu                                 │
│  ℹ kjarninn.is fer yfir 50k birtingar í dag                  │
│                                                              │
│  Top auglýsendur (síðustu 7d)        Top útgefendur (7d)    │
│  1. Blómabúð V.b.    – 28.400 kr     1. kjarninn.is – 42k   │
│  2. Akademias        – 22.150 kr     2. heimildin.is– 31k   │
│  3. Bókabúð V.b.     – 14.000 kr     3. markadss... – 25k   │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Review queue

```
┌──────────────────────────────────────────────────────────────┐
│  Yfirferð                                  7 bíða (4klst+: 2)│
├──────────────────────────────────────────────────────────────┤
│  Sía: [Allar ▼] [Allar flaggar ▼]    Raða: [Elst fyrst ▼]   │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ [thumb] Akademias · Námskeið um sumarið                 ││
│  │         Hlaðið upp: 02.06 09:14 · Bíður: 3klst         ││
│  │         Flaggar: [Lágt NSFW 0.12] [URL óvenjuleg]      ││
│  │                                          [Skoða →]      ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ [thumb] Sportkort.is · Sumarferðir                      ││
│  │         Hlaðið upp: 02.06 08:02 · Bíður: 4klst         ││
│  │         Flaggar: [Texti: "Free"] [URL redirect chain]  ││
│  │                                          [Skoða →]      ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Review modal:**
```
┌──────────────────────────────────────────────────────────┐
│  Yfirferð auglýsingar                              [×]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────┐  Auglýsandi                │
│  │                         │  Akademias                  │
│  │   [full creative]       │  Kennitala: 123456-7890     │
│  │                         │  Stofnaður: 14.05.2026      │
│  │                         │                             │
│  └─────────────────────────┘  Saga: 4 samþykktar, 0 hafn.│
│                                                          │
│  Smellur fer á:                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ akademias.is/sumarid?utm=ad&id=xyz                   ││
│  │ → Redirect → akademias.is/courses/summer             ││
│  │ → Final: akademias.is/courses/summer                 ││
│  │ Google Safe Browsing: Hreint                         ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  Skannaniðurstaða:                                       │
│  • NSFW skor: 0.12 (Lágt)                                │
│  • OCR texti: "Skráðu þig á sumarnámskeið — sparaðu..."│
│  • Bannlistuð orð: engin                                 │
│  • Flokkun: Menntun                                      │
│                                                          │
│  Ástæða (valfrjáls):                                     │
│  [____________________________________________]         │
│                                                          │
│  [Hafna]                              [Samþykkja]        │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Payouts queue

```
┌──────────────────────────────────────────────────────────────┐
│  Útborganir                                                  │
├──────────────────────────────────────────────────────────────┤
│  Bíða vinnslu (2)                                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ☐ kjarninn.is · Maí 2026                                │ │
│  │   Brúttó 18.250 kr · Þóknun 3.650 kr · Nettó 14.600 kr  │ │
│  │   IBAN: IS00 0000 0000 0000 0000 0000 00               │ │
│  │   Kennitala: 555555-5555                                │ │
│  │   Tilvísun: [_________________]  [Merkja greitt]        │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ☐ heimildin.is · Maí 2026                               │ │
│  │   ...                                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Merkja valdar sem greiddar]                                │
│                                                              │
│  Greiddar (síðustu 30d)                       [Sjá söguna →] │
│  Apríl 2026 — 4 útborganir, 47.200 kr samtals                │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Publisher / Advertiser management

Searchable tables. Columns: Name, status badge, total earnings/spend, last activity, [Skoða] button.

**Detail view:** all profile fields, ledger entries (chronological), suspend/activate, "Skoða sem þessi notandi" (impersonation for support).

### 5.5 Platform stats

- Time-series charts: impressions, revenue, scan flag rate, error rate, p95 latency
- Period selector (24h / 7d / 30d / 90d)
- Drill-down by publisher, advertiser, slot
- Export CSV

### 5.6 System settings

- Platform fee % (input, with confirm dialog)
- Global blocked keywords (textarea, one per line)
- Teya configuration status (connected / disconnected)
- Auto-scan thresholds (NSFW cutoff, confidence requirement)
- Maintenance mode toggle (danger, requires text confirmation)

---

## 6. Embed Widgets

Web components delivered as a single `<script>` include:

```html
<script src="https://widgets.adplatform.is/v1/widgets.js" defer></script>
```

### 6.1 `<adplatform-stats>`

```html
<adplatform-stats
  publisher-key="pk_live_xxx"
  period="30d"
  theme="auto">
</adplatform-stats>
```

Renders: 3 stat cards (impressions, earnings, eCPM) + small sparkline. Matches host page's color scheme automatically (light/dark detection via `prefers-color-scheme`).

### 6.2 `<adplatform-approval-queue>`

```html
<adplatform-approval-queue
  publisher-key="pk_live_xxx"
  on-approve="myApproveHandler"
  on-reject="myRejectHandler">
</adplatform-approval-queue>
```

Renders: pending creatives list with approve/reject buttons. Emits custom events that publisher's host page can hook into for CMS integration.

### 6.3 `<adplatform-campaign-stats>`

```html
<adplatform-campaign-stats
  campaign-id="camp_xxx"
  viewer-key="vk_xxx">
</adplatform-campaign-stats>
```

For embedding inside advertiser's own dashboards (e.g., markadssetning.is rendering campaign performance inside their UI).

---

## 7. Mobile Adaptations

### 7.1 Universal

- Sidebar → top hamburger menu, slides in from left as overlay
- Tables → stacked cards (one card per row, labels above values)
- Multi-step wizards → still multi-step but step indicator moves to top
- Modals → bottom-sheet style (slide up from bottom, full-width)

### 7.2 Advertiser-specific

- Dashboard: wallet card full-width on top, stats stack vertically, campaigns list as cards
- Create campaign: each step is its own full screen with bottom-fixed "Næsta" button
- Slot picker (step 3): list view only, filters in collapsible drawer

### 7.3 Publisher-specific

- Dashboard: same stacking pattern
- Slot wizard size picker: 2-column grid of size options
- Snippet copy: tap-to-copy with toast confirmation

### 7.4 Admin

- Admin is desktop-primary. Mobile shows read-only views with disabled action buttons and a banner: "Notaðu tölvu fyrir samþykkt og útborganir."

---

## 8. Microcopy Reference

### 8.1 Empty states

- Advertiser dashboard: "Þú ert ekki kominn af stað enn. Settu inn inneign til að búa til þína fyrstu herferð."
- Publisher dashboard: "Þú ert ekki með nein auglýsingapláss. Búðu til þitt fyrsta pláss til að byrja að græða."
- Approval queue empty: "Engar auglýsingar bíða samþykktar. Frábært!"
- Campaign list empty: "Engar herferðir enn. [Búa til herferð]"

### 8.2 Confirmation prompts

- Delete creative: "Ertu viss um að eyða þessari auglýsingu? Þetta er ekki hægt að taka til baka."
- Pause campaign: "Þagga þessa herferð? Þú getur kveikt aftur hvenær sem er."
- Suspend publisher: "Setja þennan útgefanda í pásu? Engar auglýsingar verða þjónaðar á þeirra vefjum."

### 8.3 Error messages

- Insufficient wallet: "Veski inniheldur ekki nóg til að klára þessa aðgerð. [Setja inn inneign]"
- Network error: "Tenging mistókst. Athugaðu nettengingu og reyndu aftur."
- Validation: "Þessi reitur er ekki gildur."
- Auto-rejected creative: "Auglýsingin var ekki samþykkt sjálfvirkt. [Sjá ástæðu] [Áfrýja]"

### 8.4 Success notifications

- Top-up: "Inneign uppfærð: +20.000 kr"
- Campaign created: "Herferð stofnuð og er í yfirferð."
- Campaign approved: "Herferð samþykkt og byrjar að birtast."
- Slot created: "Pláss stofnað. Sæktu kóðann til að setja á síðuna."
- Payout marked paid: "Útborgun merkt sem greidd."

---

## 9. Accessibility Requirements

- All interactive elements keyboard-navigable.
- Focus rings: 2px blue-900, 2px offset, visible on all focusable elements.
- Form fields have visible labels (no placeholder-as-label).
- Form errors announced via aria-live.
- Tables use proper `<th>` + `scope`.
- Color is never the only indicator (status uses badges with text + icons).
- Sufficient contrast: body text on white ≥ 7:1 (slate-900), secondary ≥ 4.5:1 (slate-600).
- Modal traps focus and returns focus on close.
- Skip-to-content link on every page.

---

## 10. Implementation Notes

### 10.1 Component library suggestion

Build on top of **Radix UI primitives** (Dialog, Dropdown, Tabs, Toast) with Tailwind classes. Wrap each in a thin layer that applies the design system tokens. Avoids reinventing accessibility and gives consistent behavior across surfaces.

### 10.2 Charts

Use **Recharts** or **Visx** for time-series and bar charts. Lightweight; matches React patterns. Avoid heavy chart libs (Highcharts, AmCharts) for MVP.

### 10.3 Forms

**React Hook Form + Zod** for validation. Shared schemas in `packages/shared` (validate same way on frontend and backend).

### 10.4 Tables

**TanStack Table v8** headless — supports sorting, filtering, pagination without imposing markup.

### 10.5 State management

- Local: React state / `useReducer` for component state.
- Remote: **TanStack Query** for API caching, optimistic updates, polling on dashboard.
- Global UI: Context providers for auth, locale, toasts (mirroring markadssetning.is pattern).

### 10.6 Routing

- React Router v7.
- Route-based code splitting per major surface (advertiser / publisher / admin chunked separately).

### 10.7 Internationalization

- Use `react-i18next` even though V1 is Icelandic-only; sets up correctly for English in V2 (international launch optionality).
- All copy in this spec should map to `is.json` keys.

---

## 11. Out of Scope for V1 UI

- Dark mode (V2; design system supports it but light is default)
- English locale (V2)
- Real-time collaboration (multiple editors on same campaign)
- Drag-drop campaign builder canvas (V3 maybe)
- Marketing site / public landing (separate project)
- Email templates (handled by transactional email service; not part of this UI spec)
- Mobile native apps (web-responsive only)
