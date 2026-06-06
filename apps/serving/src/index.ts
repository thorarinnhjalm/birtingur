import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { adRoute } from './routes/ad.js';
import { clickRoute } from './routes/click.js';
import { impressionRoute } from './routes/impression.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const app = new Hono();

app.use('/*', cors());
app.get('/healthz', (c) => c.json({ ok: true }));

const serveLocalFile = (relativePath: string) => {
  return (c: any) => {
    const pathsToTry = [
      join(process.cwd(), relativePath),
      join(process.cwd(), 'apps/serving', relativePath),
      join(__dirname, '..', relativePath),
      join(__dirname, '../..', relativePath),
    ];
    for (const p of pathsToTry) {
      if (existsSync(p)) {
        try {
          const content = readFileSync(p, 'utf8');
          return c.text(content, 200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          });
        } catch (err) {
          console.error(`Error reading path ${p}:`, err);
        }
      }
    }
    return c.text('File not found', 404);
  };
};

app.get('/widget.js', serveLocalFile('public/widget.js'));
app.get('/v1/widgets.js', serveLocalFile('public/v1/widgets.js'));

app.route('/v1/ad', adRoute);
app.route('/v1/click', clickRoute);
app.route('/v1/impression', impressionRoute);

export default app;
