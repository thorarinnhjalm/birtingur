import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { publishersRouter } from './routes/publishers.js';
import { slotsRouter } from './routes/slots.js';
import { advertisersRouter } from './routes/advertisers.js';
import { creativesRouter } from './routes/creatives.js';
import { campaignsRouter } from './routes/campaigns.js';
import { walletRouter } from './routes/wallet.js';
import { teyaWebhookRoute } from './routes/webhooks/teya.js';
import { handleError } from './lib/errors.js';
import { adminRoutes } from './routes/admin/index.js';
import { apiKeysRouter } from './routes/api-keys.js';
import { widgetsRouter } from './routes/widgets.js';
import { categoriesRouter } from './routes/categories.js';
import { supportRouter } from './routes/support.js';
import { notificationsRouter } from './routes/notifications.js';

export const app = new Hono();

app.use(
  '/*',
  cors({
    origin: (origin) => origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  }),
);
app.onError(handleError);

app.get('/healthz', (c) => c.json({ ok: true }));

app.route('/v1/publishers', publishersRouter);
app.route('/v1/publishers/me/slots', slotsRouter);
app.route('/v1/advertisers', advertisersRouter);
app.route('/v1/creatives', creativesRouter);
app.route('/v1/campaigns', campaignsRouter);
app.route('/v1/advertisers/me/wallet', walletRouter);
app.route('/api/teya/webhook', teyaWebhookRoute);
app.route('/v1/admin', adminRoutes);
app.route('/v1/api-keys', apiKeysRouter);
app.route('/v1/widgets', widgetsRouter);
app.route('/v1/categories', categoriesRouter);
app.route('/v1/support', supportRouter);
app.route('/v1/notifications', notificationsRouter);

export default app;
