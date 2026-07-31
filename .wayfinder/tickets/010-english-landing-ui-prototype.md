# Ticket 010: English Landing UI Prototype

`wayfinder:prototype`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig á að byggja viðmót nýju ensku síðunnar (`apps/dashboard/src/pages/EnglishLanding.tsx`) með Nordic Editorial hlutum (`Eyebrow`, `EditorialH1`, `BigFigure`, `PillButton`) og gagnvirku biðlistaformi?

## Resolution / Niðurstaða

1. **Viðmót og Hönnun (`EnglishLanding.tsx`):**
   - Stofnuð ný síða `apps/dashboard/src/pages/EnglishLanding.tsx` sem er aðgengileg á leiðinni `/en` í `apps/dashboard/src/App.tsx`.
   - Nýtir Nordic Editorial einingar (`Eyebrow`, `EditorialH1`, `BigFigure`, `PillButton`).
   - Sýnir 3 helstu kosti kynntir á ensku: **100% Cookie-Free**, **80% Payout Share**, og **Flat CPM Pricing**.

2. **Gagnvirkt Biðlistaform (_Interactive Waitlist Form_):**
   - Styður val milli **Brand / Advertiser**, **Creator / Publisher**, eða **Both**.
   - Sendir JSON kvaðningu á REST API leiðina `/v1/waitlist`.
   - Sýnir skýr viðbrögð (_Success state_) við skráningu ásamt öruggri villumeðhöndlun.
