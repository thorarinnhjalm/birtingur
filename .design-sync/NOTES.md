# design-sync notes — Birtingur UI Kit (@ada/dashboard)

Repo-specific facts for future syncs. Config: `.design-sync/config.json`; target project "Birtingur UI Kit" (`8f5fa872-7e15-42a4-95be-10e2578a487d`).

## Setup gotchas

- **App package, not a library**: `@ada/dashboard` has no dist entry; `cfg.entry` points at a deliberately nonexistent path (`apps/dashboard/dist-ds/index.js`) so the converter walks up to the right PKG_DIR and synthesizes the entry from `cfg.srcDir` (`src/components`). Do not "fix" the phantom path.
- **Tailwind 4 CSS must be compiled before the converter**: run `cfg.buildCmd` (tailwindcss CLI over `apps/dashboard/.design-sync-styles.css` → `.ds-styles.css`, gitignored) whenever component/preview classes change. The entry also carries the remote Google Fonts @import for Inter ([FONT_REMOTE] on validate is expected).
- **Render check browser**: no playwright chromium cache on this machine — pass `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` to validate/capture.
- `PublicHeader`/`PublicFooter` were default-only exports; named exports were appended in-app (the synth entry's `export *` cannot re-export defaults). Keep the named exports.
- `cfg.provider` = `DSProvider` from `.design-sync/ds-provider.tsx` (extraEntries): MemoryRouter + the app's real AuthProvider. Firebase initializes with its mock-config fallbacks under the bundle's stubbed `import.meta.env`; layout components render the logged-out state. API fetches to localhost:3001 fail in cards — components degrade to empty data.

## Preview-authoring facts

- Import components from `'@ada/dashboard'`; lucide-react available. Icelandic content, harvested from `apps/dashboard/src/pages/**`.
- Component-internal and app-used Tailwind utilities resolve in previews (compiled set covers the whole app source); use inline styles for novel layout glue, or re-run buildCmd to pick up new classes from `.design-sync/previews/` (`@source`'d).
- Badge `variant` is REQUIRED (success|pending|danger|info|neutral) — omitting renders unstyled.
- Input has built-in `label` and `error` props — don't hand-roll label wrappers.
- ErrorState hardcodes the heading "Villa kom upp"; `message` is the body only.
- Constrain preview cells with inline `maxWidth` (~380–520px) — full-width components stretch to the sheet column.
- StatCard renders inside Card with `min-h-[120px]`; 2-col grids at ~180–240px/cell avoid overflow warnings.

- AnalyticsChart lives in group `charts` (sheet `charts__AnalyticsChart.png`). Its preview module applies a cumulative rAF-timestamp skew (+2000ms/frame) so recharts' 1.5s draw animation completes before capture — recharts here doesn't expose `isAnimationActive`. Keep the skew if the preview is rewritten; other recharts previews will need the same trick.
- Capture Chrome lacks is-IS locale data: chart axis dates render "15 Jun" not "15. jún." — cosmetic, environment-level, not fixable from previews.

## Known render warns

- None — final 2026-07-01 run: 15/15 render clean, 0 bad/thin/variantsIdentical, grid-overflow all resolved via cfg.overrides (StatCard/AnalyticsChart/TopBar/PublicHeader/PublicFooter → column; Sidebar/AppShell → single).

## Re-sync risks

- `.ds-styles.css` is generated from the app's own source scan — a class used only by a preview and not by the app silently disappears if buildCmd isn't re-run after preview edits.
- DSProvider leans on the app's real AuthProvider + Firebase mock-config fallbacks in `apps/dashboard/src/lib/firebase.ts`; if those fallbacks are removed, layout previews break at module init.
- The phantom `cfg.entry` path breaks if someone creates a real `apps/dashboard/dist-ds/`.
- Inter and Material Symbols are served via remote Google Fonts @imports in `apps/dashboard/.design-sync-styles.css` — offline render environments fall back silently; Material Symbols missing shows raw ligature words ("grid_view").
- `cfg.dtsPropsFor` hand-enumerates ALL 15 components' props (no built .d.ts tree exists — app package). These DRIFT when component APIs change: re-verify against `src/components/**` interfaces on every re-sync.
- TanStack Query is pinned to 5.40.0 via root pnpm.overrides; DSProvider bundles it — a version bump changes the bundle but not previews.
