import { Hono } from 'hono';
import { requireAuth, type Env } from '../lib/auth.js';
import { issueApiKey, revokeApiKey } from '../services/api-keys.js';

export const apiKeysRouter = new Hono<Env>();
apiKeysRouter.use('*', requireAuth);

apiKeysRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    scope?: 'advertiser' | 'publisher' | 'both';
  };
  const scope = body.scope ?? 'both';

  const result = await issueApiKey(user.email, scope);
  return c.json(
    {
      apiKeyId: result.id,
      apiKey: result.key,
      warning: 'Geymdu þennan lykil. Hann verður ekki birtur aftur.',
    },
    201,
  );
});

apiKeysRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await revokeApiKey(id);
  return c.json({ ok: true });
});
