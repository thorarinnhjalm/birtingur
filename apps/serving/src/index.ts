import { Hono } from 'hono';
import { adRoute } from './routes/ad';
import { clickRoute } from './routes/click';
import { impressionRoute } from './routes/impression';

export const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

app.route('/v1/ad', adRoute);
app.route('/v1/click', clickRoute);
app.route('/v1/impression', impressionRoute);

export default app;
