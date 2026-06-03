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
    'process.env.API_BASE': JSON.stringify(
      process.env.API_BASE ?? 'http://localhost:3001',
    ),
  },
});

console.log('Built dist/widgets.js');
