# Ticket 001: Monorepo Subsystems & Dependency Graph

`wayfinder:research`
`status: closed`
`assignee: @antigravity`
`closed_at: 2026-07-31`

## Question

Hvernig flæða gerðir, Zod schemas og virkni úr stofnpakkanum `@ada/shared` yfir í alla 7 undirheimana, og hvaða hætta er á brotlegum breytingum (*breaking changes*) við uppfærslur?

## Resolution / Niðurstaða

1. **Ein stök uppspretta sannleikans (*Single Source of Truth*):**
   `@ada/shared` er kjarninn í öllu kerfinu og býður upp á fimm meginútflutningsleiðir:
   - `@ada/shared` (Root export: samnýttar fastar, formatterar og skemu).
   - `@ada/shared/schemas` (Zod valideringar og skemu).
   - `@ada/shared/types` (TypeScript viðmót og gerðir).
   - `@ada/shared/firestore` (Söfnunarnöfn `COLLECTIONS` og Firestore typed converters).
   - `@ada/shared/formatting` (Íslensk gjaldmiðla- og dagsetningaformun).

2. **Byggingar- og gerðakeðja (*Build Dependency Graph*):**
   - Inni í `turbo.json` eru verkefni eins og `build`, `typecheck`, `lint` og `test` stillt með `"dependsOn": ["^build"]`.
   - Sérhver undirpakki (API, Serving, Dashboard, MCP osfrv.) keyrir `pnpm --filter @ada/shared build` áður en sinni propriatary vinnslu lýkur.
   - Breytingar á Zod skemum eða TypeScript týpum endurspeglast í `dist/index.d.ts` í shared pakkanum.

3. **Vörn gegn samþættingarbrotum (*Integration Safety Guard*):**
   - Við sérhverja skráningu á kóða keyrir `.githooks/pre-push` sjálfvirka skipunina `pnpm verify` (`format:check && typecheck && lint`).
   - Þetta tryggir að ef breyting í `@ada/shared` raskar samningum (*API contracts*), Hono línum í API, eða React frontend props í Dashboard, stoppar kerfið kvaðninguna strax.
