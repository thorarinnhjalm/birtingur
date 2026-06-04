import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { adRoute } from './routes/ad.js';
import { clickRoute } from './routes/click.js';
import { impressionRoute } from './routes/impression.js';

export const app = new Hono();

app.use('/*', cors());
app.get('/healthz', (c) => c.json({ ok: true }));

app.route('/v1/ad', adRoute);
app.route('/v1/click', clickRoute);
app.route('/v1/impression', impressionRoute);

export default app;
