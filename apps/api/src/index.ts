import { Hono } from 'hono';
import { publishersRouter } from './routes/publishers';
import { handleError } from './lib/errors';

export const app = new Hono();

app.onError(handleError);

app.get('/healthz', (c) => c.json({ ok: true }));

app.route('/v1/publishers', publishersRouter);

export default app;
