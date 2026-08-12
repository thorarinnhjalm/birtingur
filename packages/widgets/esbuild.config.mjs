import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  target: ['es2018'],
  format: 'iife',
  outfile: 'dist/widgets.js',
  legalComments: 'none',
  define: {
    // BAKED IN at build time, exactly like the snippet's SERVE_BASE — and it
    // carried the same bug: the default was http://localhost:3001, so the
    // widgets bundle shipped to production called localhost on every
    // visitor's machine and every embedded stats/approval widget on an
    // external page was silently dead (discovered 2026-08-12 by grepping the
    // live bundle on serving.birtingur.app). The default must be the real
    // production API origin; override with API_BASE only for a local build.
    'process.env.API_BASE': JSON.stringify(
      process.env.API_BASE ?? 'https://api.birtingur.app',
    ),
  },
});

console.log('Built dist/widgets.js');
