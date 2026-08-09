import { auth } from './firebase.js';
import type { MiddlewareHandler } from 'hono';
import { AppError } from './errors.js';

export interface UserContext {
  uid: string;
  email: string;
  admin?: boolean;
  apiKeyId?: string;
  scope?: 'advertiser' | 'publisher' | 'both';
}

export type Env = {
  Variables: {
    user: UserContext;
  };
};

import { verifyApiKey } from '../services/api-keys.js';

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      },
      401,
    );
  }

  const token = authHeader.substring(7).trim();

  // Try API key verification first
  if (token.startsWith('ak_')) {
    const record = await verifyApiKey(token);
    if (!record) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Invalid or revoked API key',
        },
        401,
      );
    }
    c.set('user', {
      uid: `apikey:${record.id}`,
      email: record.ownerEmail.toLowerCase(),
      admin: false,
      apiKeyId: record.id,
      scope: record.scope,
    });
    await next();
    return;
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const email = decodedToken.email || '';

    // The entire authorization model keys on email (admin grants here, ownerEmail
    // ownership in Firestore rules). Firebase email/password sign-up is reachable
    // with the public web API key, so an unverified token could claim someone
    // else's email and impersonate them. Reject any email-bearing token that has
    // not verified its address.
    if (email && decodedToken.email_verified !== true) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Email address must be verified',
        },
        401,
      );
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    // Email here is guaranteed verified (unverified tokens were rejected above),
    // so an allowlist admin grant is safe. Server-set custom claims
    // (decodedToken.admin) are trusted regardless.
    //
    // There is deliberately NO domain-suffix grant here. Until 2026-08-09 this
    // granted admin to any verified `@adplatform.is` address — and that domain
    // is not registered. Anyone could have bought it, created a mailbox, signed
    // up, verified the address, and been handed the whole `/v1/admin/*` surface,
    // which includes payouts. Nobody could have been using the rule legitimately
    // either, since no mailbox can exist on a domain that does not resolve, so
    // removing it locks nobody out.
    //
    // If a company-domain grant is ever wanted again, drive it from an env var
    // (e.g. ADMIN_EMAIL_DOMAIN) so it is set to a domain that is actually owned,
    // and remember a hardcoded one silently becomes a backdoor the day the
    // domain lapses. ADMIN_EMAILS covers the current need.
    const isAdmin = !!decodedToken.admin || adminEmails.includes(email.toLowerCase());

    c.set('user', {
      uid: decodedToken.uid,
      email: email.toLowerCase(),
      admin: isAdmin,
      scope: 'both',
    });

    await next();
  } catch {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      },
      401,
    );
  }
};

export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  const user = c.get('user');

  if (!user || !user.admin) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Admin access required',
      },
      403,
    );
  }

  await next();
};

/**
 * Gates an advertiser-owned or publisher-owned router to `ak_` keys whose
 * scope matches. Firebase ID tokens always carry `scope: 'both'` (see
 * requireAuth above) so this never affects dashboard users — only API keys
 * with a narrower scope are restricted. Retro-fixes the gap noted when this
 * feature was designed: today no route enforces `scope` at all, so an
 * `advertiser`-scoped key could already reach `/v1/publishers/me/slots` (and
 * vice versa) purely because nothing checked.
 */
export function requireScope(required: 'advertiser' | 'publisher'): MiddlewareHandler<Env> {
  return async (c, next) => {
    const user = c.get('user');
    if (user.apiKeyId && user.scope !== 'both' && user.scope !== required) {
      return c.json(
        {
          error: 'Forbidden',
          message: `This API key's scope ('${user.scope}') cannot access ${required} endpoints`,
        },
        403,
      );
    }
    await next();
  };
}

/**
 * Blocks `ak_` key callers from a route that has no corresponding MCP/API-key
 * tool in v1 — i.e. the only way to reach it with a key is a raw `ak_` key
 * used directly against the REST API, not through any sanctioned agent
 * workflow. `requireScope` above only checks the key's advertiser/publisher
 * scope; it doesn't (and shouldn't) block dashboard-only *operations* within
 * a scope a key otherwise has. This closes concrete gaps found in adversarial
 * review: an agent self-activating its own pending campaign via status PATCH,
 * a monthly-cap bypass via budget PATCH, self-approval of a rejected creative
 * via re-scan (propagateCreativeChange), unmetered Gemini spend via
 * /creatives/generate, and key self-issuance/self-revocation. Firebase
 * ID-token (dashboard) callers never carry `apiKeyId`, so they're never
 * affected — same as the existing approve/reject/purchase-config blocks this
 * mirrors (see routes/campaigns.ts, routes/api-keys.ts).
 */
export function rejectApiKeyMutation(user: UserContext, action: string): void {
  if (user.apiKeyId) {
    throw new AppError(
      403,
      `API keys cannot ${action} — this operation is dashboard-only in v1`,
      'AGENT_MUTATION_NOT_ALLOWED',
    );
  }
}
