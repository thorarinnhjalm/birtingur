# Ticket 002: Data Ledger & Financial Audit

`wayfinder:grilling`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig tryggjum við 100% samræmi milli Firestore Ledger, committed-funds reservation gating, Redis accrual queues og crons (`cron-accrue`, `cron-reconcile`) án nokkurs hættu á tvítalinni fjármununotkun eða ósamræmi?

## Resolution / Niðurstaða

1. **Append-Only Færslubók (Ledger as Source of Truth):**
   - Alla peningafærslur skráast í `ledger` safnið í Firestore með fastgreindum gerðum (`topup`, `campaign_charge`, `refund`, `publisher_credit`, `platform_fee`).
   - Raunstöðu er einungis treyst frá `sumByParty` úr ledger færslum. Mirror-svæðið `walletBalanceIsk` á auglýsanda er uppfært til flýtis, en er alltaf sannreynt gegn ledger í afstemmingu.

2. **Gátt um tekin efnistök (*Committed-Funds Reservation Gating*):**
   - Við stofnun herferðar eða hækkun fjárhagsáætlunar eru fjármunir teknir í frátekið horf (*committed*) án þess að færa neina neikvæða færslu á ledger-inn strax.
   - `availableIsk = balanceIsk - committedIsk`.
   - Skráningarprófun keyrir í Firestore transaction (`getAvailableBalanceInTransaction`) sem læsir `fundsVersion` á auglýsendaskjalinu til að koma í veg fyrir kapphlaupsskilyrði (*race conditions*).

3. **Varðveisluregla Peninga í Áfallandi Gjöldum (*Money Conservation*):**
   - Hjá `/api/cron-accrue` eru birtingar teknar úr Redis röðinni (`events:accrual`).
   - Auglýsandi er gjaldfærður fyrir heildarbrúttó (`campaign_charge`), og útbýting skiptist í `publisher_credit` (80%) og `platform_fee` (20%).
   - Nákvæmt jafnvægi: `sum(publisher_credit) + sum(platform_fee) === sum(campaign_charge)`.

4. **Fail-Closed Öryggi & Dagleg Afstemming (`cron-reconcile`):**
   - Ef `budget:{id}` í Redis vantar eða tæmist, lokar kerfið á birtingar (`fail-closed`).
   - Dagleg afstemming (`services/reconciliation.ts`) keyrir fimm sjálfvirkar athuganir (`campaign_spend_mismatch`, `money_conservation_mismatch`, `advertiser_mirror_mismatch`, `redis_budget_overseeded`, `stale_agent_pending_campaign`) og lætur ops vita ef frávik finnast.
