import { auth } from './firebase.js';
import type { MiddlewareHandler } from 'hono';

export interface UserContext {
  uid: string;
  email: string;
  admin?: boolean;
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
  if (token === 'demo-mock-token') {
    c.set('user', {
      uid: 'demo-user-id',
      email: 'demoa@birta.is',
      admin: true,
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
    });
    await next();
    return;
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const email = decodedToken.email || '';
    
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isAdmin =
      !!decodedToken.admin ||
      email.endsWith('@adplatform.is') ||
      email === 'admin@a.is' ||
      adminEmails.includes(email.toLowerCase());

    c.set('user', {
      uid: decodedToken.uid,
      email,
      admin: isAdmin,
    });

    await next();
  } catch (error) {
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
