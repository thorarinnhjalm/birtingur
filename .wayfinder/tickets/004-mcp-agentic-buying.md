# Ticket 004: MCP Agentic Buying & Safety Limits

`wayfinder:grilling`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig eru öryggismörk gervigreindarkaupa í gegnum MCP þjóninn (`apps/mcp`) tryggð gegn stjórnlausum eyðslum eða ógildum kaupum?

## Resolution / Niðurstaða

1. **Beinn Aðgangur Bannaður (Stateless MCP Gateway):**
   - MCP þjónninn í `apps/mcp` er algjörlega án beins gagnagrunnsaðgangs (*no direct DB access*). Hann sendir allar beiðnir í gegnum REST API sölulínur í `apps/api`.
   - Lyklasvið (`scope: 'advertiser' | 'publisher' | 'both'`) er sótt í gegnum `GET /v1/api-keys/me`. Ef auðkenning mistekst eru engin verkfæri (*tools*) skráð á þjóninn.

2. **Skilyrðislaus Öryggismörk (Opt-In & Hard Spending Controls):**
   - **`purchase.enabled`**: Til að gera gervigreindarkaup virk verður eigandi API lykilsins að kveikja sérstaklega á því (*opt-in*). Sé það óvirkt lokar API á stofnun herferða (`403 FORBIDDEN`).
   - **`monthlyCapIsk`**: Mánaðarleg eyðslumörk. Summa allra stofnaðra herferða á núverandi almanaksmánuði fyrir hlutaðeigandi API lykil má ekki fara yfir þessa upphæð.
   - **`autoApproveLimitIsk`**: Hámark sjálfvirkra samþykkta. Kaup umfram þessa upphæð stofnast í biðstöðu (`pending_approval`, `pendingReason: 'agent_purchase'`) og krefjast handvirks samþykkis eiganda í mælaborði.
   - Valkostirnir krefjast þess að `autoApproveLimitIsk <= monthlyCapIsk` og báðar tölur verða að vera skráðar beint án sjálfgefinna gilda (*fail-closed*).

3. **Vörn gegn Tvítölun & Takmörkun Heimilda:**
   - **Engin geymslu- eða peningafærsluleið:** Innborgun á veski (*top-up*), endurgreiðslur og hækkanir eru eingöngu aðgengilegar í gegnum mælaborð með Firebase ID-token (API lyklar hafa enga leið til að bæta við peningum).
   - API lykill (`ak_`) getur **aldrei** samþykkt eigin herferð sem er í bið stöðu (`POST /v1/campaigns/:id/approve` krefst ID-token).
   - **`Idempotency-Key`**: Styður tvíritunarsefjun til að koma í veg fyrir að endurteknar kvaðningar frá gervigreind (*LLM retries*) stofni tvítaldar herferðir.
