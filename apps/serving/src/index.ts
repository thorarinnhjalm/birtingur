import { Hono } from 'hono';

export const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

// Routes will be mounted here in subsequent tasks

export default app;
