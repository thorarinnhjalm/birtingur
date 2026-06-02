import { Hono } from 'hono';
import { publishersRouter } from './routes/publishers';
import { slotsRouter } from './routes/slots';
import { handleError } from './lib/errors';

export const app = new Hono();

app.onError(handleError);

app.get('/healthz', (c) => c.json({ ok: true }));

app.route('/v1/publishers', publishersRouter);
app.route('/v1/publishers/me/slots', slotsRouter);

export default app;
