import { Hono } from 'hono';
import { requireAuth, rejectApiKeyMutation, type Env } from '../lib/auth.js';
import {
  issueApiKey,
  revokeApiKey,
  listApiKeys,
  getApiKeyRecord,
  updateApiKeyPurchase,
} from '../services/api-keys.js';
import { getMonthToDateAgentSpend } from '../services/campaigns.js';
import { AppError } from '../lib/errors.js';

export const apiKeysRouter = new Hono<Env>();
apiKeysRouter.use('*', requireAuth);

// Read by the MCP server (createMcpServer) to resolve a key's scope and
// purchase capability before deciding which tool sets to register — see
// apps/mcp/src/server.ts. `purchase` is null when the key has no purchase
// block at all (never configured); when present it also reports the
// derived month-to-date agent spend and the remaining headroom under the
// monthly cap so an agent (or the dashboard) can plan around it without a
// second round trip.
apiKeysRouter.get('/me', async (c) => {
  const user = c.get('user');

  let purchase: {
    enabled: boolean;
    monthlyCapIsk: number;
    autoApproveLimitIsk: number;
    monthToDateSpentIsk: number;
    remainingCapIsk: number;
  } | null = null;

  if (user.apiKeyId) {
    const record = await getApiKeyRecord(user.apiKeyId);
    if (record?.purchase) {
      const monthToDateSpentIsk = await getMonthToDateAgentSpend(user.apiKeyId);
      purchase = {
        ...record.purchase,
        monthToDateSpentIsk,
        remainingCapIsk: Math.max(0, record.purchase.monthlyCapIsk - monthToDateSpentIsk),
      };
    }
  }

  return c.json({
    email: user.email,
    admin: user.admin,
    apiKeyId: user.apiKeyId,
    scope: user.scope ?? 'both',
    purchase,
  });
});

apiKeysRouter.get('/', async (c) => {
  const user = c.get('user');
  const keys = await listApiKeys(user.email);
  return c.json(keys);
});

// Dashboard/ID-token only — a key that could mint its own new key (e.g. a
// narrower-scoped key issuing itself a 'both' key) would defeat the entire
// scope model. Keys can never mint keys.
apiKeysRouter.post('/', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'issue API keys');
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

// Dashboard/ID-token only (keys can never revoke keys — same reasoning as
// POST / above), and ownership-scoped: without the ownerEmail check below any
// authenticated caller could revoke ANY key by guessing/enumerating its id.
apiKeysRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  rejectApiKeyMutation(user, 'revoke API keys');
  const id = c.req.param('id');
  const record = await getApiKeyRecord(id);
  if (!record) {
    throw new AppError(404, `API key ${id} not found`, 'NOT_FOUND');
  }
  if (record.ownerEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  await revokeApiKey(id);
  return c.json({ ok: true });
});

// Owner-only: turns purchase capability on/off for a key and sets its
// guardrails. Deliberately dashboard/ID-token only — an API key (agent)
// granting itself a bigger cap would defeat the whole guardrail, so this
// requires the same human-in-the-loop auth as approve/reject.
apiKeysRouter.patch('/:id/purchase', async (c) => {
  const user = c.get('user');
  if (user.apiKeyId) {
    throw new AppError(403, 'API keys cannot modify purchase configuration', 'FORBIDDEN');
  }
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    enabled?: boolean;
    monthlyCapIsk?: number;
    autoApproveLimitIsk?: number;
  };
  if (
    typeof body.enabled !== 'boolean' ||
    typeof body.monthlyCapIsk !== 'number' ||
    typeof body.autoApproveLimitIsk !== 'number'
  ) {
    throw new AppError(
      400,
      'enabled, monthlyCapIsk and autoApproveLimitIsk are all required',
      'BAD_REQUEST',
    );
  }
  const updated = await updateApiKeyPurchase(id, user.email, {
    enabled: body.enabled,
    monthlyCapIsk: body.monthlyCapIsk,
    autoApproveLimitIsk: body.autoApproveLimitIsk,
  });
  const { hash: _hash, ...safe } = updated;
  return c.json(safe);
});
