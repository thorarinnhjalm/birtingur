# ADA — Icelandic Ad Platform

Self-service display advertising platform for the Icelandic market.

See `docs/superpowers/specs/` for design specs and `docs/superpowers/plans/` for implementation plans.

## Development

```bash
pnpm install
pnpm dev
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
