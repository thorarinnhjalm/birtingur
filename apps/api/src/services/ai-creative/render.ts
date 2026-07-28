import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';

/**
 * Font source: @expo-google-fonts/inter, NOT @fontsource/inter.
 *
 * @fontsource/inter (the package named in the original plan) only ships
 * .woff/.woff2 files as of v4/v5 — verified by installing it and rendering
 * with resvg-js@2.6.2: the SVG produced a blank text layer (no error, no
 * glyphs) because this resvg-js version's font loader (`fontFiles`/`fontDirs`
 * options) only supports sfnt containers (ttf/otf/ttc), not WOFF's compressed
 * container. @resvg/resvg-js has no `fontBuffers` option either at this
 * version (only file paths / directories), contrary to what the plan
 * assumed — so fonts are loaded from disk paths via `require.resolve`, not
 * passed as in-memory buffers.
 *
 * @expo-google-fonts/inter ships the actual per-weight .ttf files (built for
 * React Native, which needs real sfnt files) with no runtime dependency on
 * Expo/React Native itself — it's a pure asset package, so `require.resolve`
 * against it works from a plain Node/Vercel function. Verified end-to-end:
 * Icelandic diacritics (þ/ð/æ/ö, all within Latin-1 Supplement) render
 * correctly, and per-weight files are matched correctly by resvg's fontdb
 * when multiple weights of the same family are loaded together.
 */
const FONT_MODULE_PATHS = [
  '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
  '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
  '@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf',
];

// Fix 3 (adversarial review): resolved LAZILY on first render, not at module
// top level. render.ts is transitively imported by api/index.js, which
// serves EVERY route in the API — resolving these paths eagerly at import
// time meant a missing/mis-bundled font asset in the Vercel deploy would
// throw during module load and 500 the entire API, not just /generate.
// Memoized after the first successful resolution (the require.resolve calls
// never change at runtime, so there's nothing to gain by repeating them per
// render); a resolution failure is NOT cached, so a transient bundling issue
// gets a fresh attempt on every subsequent /generate call instead of wedging
// this route in a broken state until redeploy.
let cachedFontFiles: string[] | null = null;

function resolveFontFiles(): string[] {
  if (cachedFontFiles) return cachedFontFiles;
  try {
    const require = createRequire(import.meta.url);
    cachedFontFiles = FONT_MODULE_PATHS.map((p) => require.resolve(p));
  } catch (err) {
    throw new Error(
      `ai-creative render: failed to resolve bundled Inter font files (${FONT_MODULE_PATHS.join(', ')}) — ` +
        'this only breaks /v1/creatives/generate, not the rest of the API. ' +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return cachedFontFiles;
}

/**
 * Rasterizes an SVG banner to PNG via @resvg/resvg-js (bundles librsvg-like
 * rendering as a native NAPI addon; ships prebuilt binaries for the common
 * platforms including linux-x64-gnu, which is what Vercel's Node runtime
 * uses, so no build step is required at deploy time). `loadSystemFonts:
 * false` plus an explicit, versioned font file list keeps output
 * deterministic across environments — never falls back to whatever fonts
 * happen to be installed on the host.
 */
export function renderSvgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: resolveFontFiles(),
      loadSystemFonts: false,
      defaultFontFamily: 'Inter',
    },
  });
  return resvg.render().asPng();
}
