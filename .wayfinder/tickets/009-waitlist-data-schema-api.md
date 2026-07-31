# Ticket 009: Waitlist Schema & API Gating

`wayfinder:research`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig á að hanna Firestore `waitlist` gagnagrindina, Zod valideringu og API endpoint `POST /v1/waitlist` í `apps/api` til að tryggja örugga biðlistasöfnun gegn spami?

## Resolution / Niðurstaða

1. **Zod Skema & Gerðir (`@ada/shared`):**
   - Stofnað skema `CreateWaitlistInputSchema` og `WaitlistEntrySchema` í `@ada/shared/schemas`.
   - Flutt út í `@ada/shared/types`: `WaitlistEntry`, `CreateWaitlistInput`, `WaitlistRole`.
   - Firestore converter `waitlistEntryConverter` og safn `COLLECTIONS.waitlist = 'waitlist'`.

2. **REST API Leið (`POST /v1/waitlist`):**
   - Almenn, opin leið (`apps/api/src/routes/waitlist.ts`) sem krefst ekki ID-token, en validerar innslátt með Zod.
   - Idempotent vörn gegn tvískráningu sama netfangs.
   - Skrifar nýja skráningu með `generateId('wtl')` í Firestore `waitlist` safnið.
