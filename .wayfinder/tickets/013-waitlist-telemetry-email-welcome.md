# Ticket 013: Waitlist Email Confirmation & Telemetry

`wayfinder:task`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig sendum við sjálfvirkan velkomins-tölvupóst á ensku via Resend þegar notandi skráir sig á biðlistann (`POST /v1/waitlist`), og hvernig sýnum við biðlistatölfræði í stjórnborði stjórnenda (`/admin`)?

## Resolution / Niðurstaða

1. **Resend Welcome Email (`apps/api/src/routes/waitlist.ts`):**
   - Útfært `sendWelcomeEmail` í API rásinni. Ef `RESEND_API_KEY` umhverfisbreytan er til staðar, sendir kerfið sjálfkrafa enskan velkomins-tölvupóst frá `hello@birtingur.app` með upplýsingum um skráninguna.

2. **Telemetry API Endpoint (`GET /v1/waitlist/stats`):**
   - Bætt við endpoint sem tekur saman heildarskráningar, flokkun á hlutverkum (Advertisers vs Publishers vs Both) og sundurliðun á vinsælustu efnisflokkunum.
