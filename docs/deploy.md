# Deploy — Vercel monorepo notes

Birtingur is one repo with **four separate Vercel projects** (`@ada/api`, `@ada/serving`,
`@ada/dashboard`, `@ada/mcp`). By default every push to the repo triggers a build in **all four**
projects — even when only one app changed (e.g. a landing-page tweak rebuilds api/serving/mcp for
nothing). Two settings keep deploys lean.

## 1. Only build the projects that actually changed — `turbo-ignore`

In **each** Vercel project: **Settings → Git → Ignored Build Step → "Run my own command"** and set:

| Vercel project | Ignored Build Step command        |
| -------------- | --------------------------------- |
| dashboard      | `npx turbo-ignore @ada/dashboard` |
| api            | `npx turbo-ignore @ada/api`       |
| serving        | `npx turbo-ignore @ada/serving`   |
| mcp            | `npx turbo-ignore @ada/mcp`       |

`turbo-ignore` checks Turborepo's dependency graph against the last successful deploy and **skips the
build** (exit 0) when neither the project's package nor any of its internal deps changed.

Result:

- Landing-page / dashboard-only change → **only dashboard** builds.
- `@ada/shared` change → **all four** build (correct — every app depends on shared).
- api-only change → only api, etc.

Caveats:

- The **first** deploy after enabling this always builds (no prior deploy to diff against).
- This is a Vercel **dashboard** setting, per project — not in the repo. Set it once per project.

## 2. Each project already builds only its own package (the "right build")

No change needed — verified:

- `apps/{api,serving,mcp}/vercel.json` → `buildCommand: "pnpm build"`, and each app's
  `package.json` `build` is **scoped**: `pnpm --filter @ada/shared build && tsc` (builds shared +
  that app only, **not** the whole monorepo / not `turbo build`).
- `dashboard` has no `buildCommand`; Vercel uses its Root Directory (`apps/dashboard`) + the package
  `build` script (`pnpm --filter @ada/shared build && tsc -b && vite build`).

So once `turbo-ignore` skips the unaffected projects, the ones that _do_ build compile only
themselves + `@ada/shared`.

## 3. Per-project settings to keep correct

- **Root Directory** must be set per project (`apps/api`, `apps/serving`, `apps/dashboard`,
  `apps/mcp`) — `turbo-ignore` and the scoped build rely on it.
- **Crons** (`*/10`, `*/15`, hourly) live in `apps/api/vercel.json` and need the api project on a
  plan that runs them at that frequency (Pro). `CRON_SECRET` must be set on the api project or the
  cron endpoints 403.
- **Env vars are per project.** `SIGNING_SECRET` → serving only. Redis (`UPSTASH_*`/`KV_*`) → api +
  serving. `GEMINI_API_KEY` → api (classifier). See `CLAUDE.md` for the auth/secret map.
