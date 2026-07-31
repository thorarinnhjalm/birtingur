# Ticket 013: Waitlist Email Confirmation & Telemetry

`wayfinder:task`
`status: active`
`assignee: @antigravity`
`created_at: 2026-07-31`

## Question

Hvernig sendum við sjálfvirkan velkomins-tölvupóst á ensku via Resend þegar notandi skráir sig á biðlistann (`POST /v1/waitlist`), og hvernig sýnum við biðlistatölfræði í stjórnborði stjórnenda (`/admin`)?

## Proposed Architecture / Tillaga

1. **Resend Email Integration:**
   - Þegar skráning tekst í Firestore `waitlist`, sendir API-ið fallegan enskan staðfestingarpóst frá `hello@birtingur.app` með upplýsingum um stöðu á biðlista.
2. **Admin Telemetry Dashboard (`/admin/waitlist`):**
   - Yfirlit í stjórnborði sem sýnir fjölda skráninga flokkað eftir hlutverki (Advertiser vs Publisher), flokki (Food, Tech, Travel) og landi.
