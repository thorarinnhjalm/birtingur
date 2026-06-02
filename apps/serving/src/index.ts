import { Hono } from 'hono';
import { adRoute } from './routes/ad';

export const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

app.route('/v1/ad', adRoute);

export default app;
