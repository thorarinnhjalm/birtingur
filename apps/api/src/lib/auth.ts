import { auth } from './firebase.js';
import type { MiddlewareHandler } from 'hono';

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

  // Bypass validation for demo/local testing
  if (token.startsWith('demo-mock-token') && process.env.NODE_ENV !== 'production') {
    const parts = token.split(':');
    const email = parts[1] || 'demoa@birtingur.is';
    const cleanUsername = email.replace(/@.*$/, '');
    c.set('user', {
      uid: `demo-user-id-${cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      email: email.toLowerCase(),
      admin: true,
      scope: 'both',
    });
    await next();
    return;
  }

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
      email: record.ownerEmail,
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
    // so domain/allowlist admin grants are safe. Server-set custom claims
    // (decodedToken.admin) are trusted regardless.
    const isAdmin =
      !!decodedToken.admin ||
      email.endsWith('@adplatform.is') ||
      adminEmails.includes(email.toLowerCase());

    c.set('user', {
      uid: decodedToken.uid,
      email,
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
