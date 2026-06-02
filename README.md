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
