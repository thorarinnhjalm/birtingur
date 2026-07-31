# Ticket 006: Local Launch Security & Rules Audit

`wayfinder:research`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Eru Firestore öryggisreglurnar (`firebase/security-rules`) og REST API auth scopes fullkomlega örugg gegn óheimilum gagnaleeka eða færslufölsun fyrir notendur Birtingar á Íslandi?

## Resolution / Niðurstaða

1. **Staðfesting á netfangi (Mandatory Email Verification):**
   - Bæði í Firestore reglum (`hasVerifiedEmail()`) og REST API middleware (`requireAuth`) eru öll óstaðfest netföng (`email_verified !== true`) lokuð af. Þetta komar í veg fyrir að einhver geti nýtt sér opna nýskráningu til að hertaka netfang eða gögn annars notanda.

2. **Lokað á beinar breytingar notenda (Zero Client Writes):**
   - Í `firebase/firestore.rules` er lokað á allar beinar breytingar frá vafra/biðlara (`allow write: if false;` á öllum söfnum: `publishers`, `slots`, `advertisers`, `creatives`, `campaigns`, `ledger`, `payouts`, `stats`).
   - Öll skrif verða að fara í gegnum REST API þjónustuaðganginn (_service account_), sem útilokar að notandi geti breytt veskisstöðu, birtingargjöldum eða herferðum beint.

3. **Einangrun á API lyklum & Aðgangstakmörk (`requireScope` & `rejectApiKeyMutation`):**
   - **`requireScope`**: Tryggir að API lyklar sem eru merkta `advertiser` geti ekki opnað útgefendalínur (og öfugt).
   - **`rejectApiKeyMutation`**: Bannar API lyklum (`ak_`) að framkvæma viðkvæmar breytingar (samþykkja eigin herferðir, breyta fjárhagsáætlunum eða útgáfu nýrra lykla) — þessar aðgerðir eru 100% bundnar við mælaborð eiganda.
