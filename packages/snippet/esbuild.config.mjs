import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  target: ['es2018'],
  format: 'iife',
  outfile: 'dist/snippet.js',
  legalComments: 'none',
  define: {
    // This value is BAKED IN at build time and cannot be changed afterwards —
    // it is the origin every ad request, impression pixel, click and pageview
    // from a publisher's page is sent to. The default must therefore be the
    // real production serving origin, not a placeholder. The previous default
    // was a hostname that does not exist in DNS, so the snippet deployed to
    // production loaded fine and then sent every request into a black hole.
    // Nothing errored anywhere — the publisher just saw no ad and the platform
    // recorded no traffic.
    //
    // Production serving is the `birtingur-serving` Vercel project on
    // `serving.birtingur.app` (note: "serving", not "serve"). Override with
    // SERVE_BASE only for a staging build.
    'process.env.SERVE_BASE': JSON.stringify(
      process.env.SERVE_BASE ?? 'https://serving.birtingur.app',
    ),
  },
});

console.log('Built dist/snippet.js');
