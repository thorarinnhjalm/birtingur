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
    'process.env.SERVE_BASE': JSON.stringify(
      process.env.SERVE_BASE ?? 'https://serve.adplatform.is',
    ),
  },
});

console.log('Built dist/snippet.js');
