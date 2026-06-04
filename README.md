# ADA — Icelandic Ad Platform

Self-service display advertising platform for the Icelandic market.

See `docs/superpowers/specs/` for design specs and `docs/superpowers/plans/` for implementation plans.

## Development

```bash
pnpm install
pnpm dev
```

Sjá nánar:

- [Rekstrarhandbók (Deployment)](file:///Users/thorarinnhjalmarsson/Documents/Antigravity/ada/docs/deployment.md) - Uppsetning á Vercel, Firebase og Upstash.
- [Kerfishönnun (Architecture)](file:///Users/thorarinnhjalmarsson/Documents/Antigravity/ada/docs/architecture.md) - Gagnamódel, Mermaid flæðirit og bókhaldskerfið.

## Gagnagrunnur og Prufugögn (Database Seeding)

Til að prófa kerfið staðbundið með gervigögnum eftir að hermirinn (emulator) er ræstur:

1. Ræstu Firebase herminn í sérstökum glugga:
   ```bash
   pnpm emulator
   ```
2. Keyrðu gagnaútsæðis-skriftuna (seeding) í öðrum glugga til að fylla herminn af prufugögnum (herferðum, útgefendum, plássum, veskjum):
   ```bash
   pnpm --filter @ada/api seed
   ```

## Prófanir (Testing)

Hluti prófanna keyrir á móti Firestore herminum og krefst þess að **Java** sé uppsett á tölvunni (`java -version`).

- **Keyra einingapróf án hermis** (Plain Vitest for `@ada/shared` & `@ada/dashboard`):
  ```bash
  pnpm --filter @ada/shared test
  ```
- **Keyra einingapróf með hermi** (Ræsir herminn sjálfkrafa, keyrir prófin og lokar honum):
  ```bash
  pnpm test:rules     # Prófar Firestore öryggisreglur
  pnpm test:api       # Prófar API bakendann
  ```

## Architecture

Turborepo monorepo:

- `apps/api` — REST API (Vercel functions)
- `apps/dashboard` — React 19 dashboard (Vite)
- `apps/mcp` — MCP server
- `apps/serving` — Hot-path ad serving (Vercel fn → Cloudflare Worker)
- `packages/shared` — Zod schemas, types, formatting, Firestore wrappers
- `packages/snippet` — Static JS snippet for publisher sites
- `packages/widgets` — Embeddable web components
- `firebase/` — Firestore rules, indexes, storage rules

## Deployment

| App       | Host                                 | URL                             |
| --------- | ------------------------------------ | ------------------------------- |
| API       | Vercel                               | api.adplatform.is               |
| Dashboard | Vercel                               | app.adplatform.is               |
| MCP       | Vercel                               | mcp.adplatform.is               |
| Serving   | Vercel (V1) / Cloudflare Worker (V2) | serve.adplatform.is             |
| Snippet   | Cloudflare R2 + CDN                  | cdn.adplatform.is/v1/snippet.js |
| Firestore | Firebase                             | ada-prod project                |
| Redis     | Upstash                              | ada-prod database               |

Crons (Vercel):

- `*/15 * * * *` — CPM accrual (`/api/cron-accrue`)
- `0 * * * *` — Stats aggregation (`/api/cron-aggregate`)
- `0 6 1 * *` — Monthly payouts (`/api/cron-payouts`)

Manual operations:

- Admin marks each payout `completed` after executing manual bank transfer to publisher IBAN.
- VAT invoicing handled by bookkeeper from monthly top-up summary export.
