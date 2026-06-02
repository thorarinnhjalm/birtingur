import { Hono } from 'hono';
import { publishersRouter } from './routes/publishers';
import { slotsRouter } from './routes/slots';
import { advertisersRouter } from './routes/advertisers';
import { creativesRouter } from './routes/creatives';
import { campaignsRouter } from './routes/campaigns';
import { slotsSearchRouter } from './routes/slots-search';
import { walletRouter } from './routes/wallet';
import { teyaWebhookRoute } from './routes/webhooks/teya';
import { handleError } from './lib/errors';
import { adminRoutes } from './routes/admin';

export const app = new Hono();

app.onError(handleError);

app.get('/healthz', (c) => c.json({ ok: true }));

app.route('/v1/publishers', publishersRouter);
app.route('/v1/publishers/me/slots', slotsRouter);
app.route('/v1/advertisers', advertisersRouter);
app.route('/v1/creatives', creativesRouter);
app.route('/v1/campaigns', campaignsRouter);
app.route('/v1/slots/search', slotsSearchRouter);
app.route('/v1/advertisers/me/wallet', walletRouter);
app.route('/api/teya/webhook', teyaWebhookRoute);
app.route('/v1/admin', adminRoutes);

export default app;
