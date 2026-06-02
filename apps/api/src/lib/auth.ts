import { auth } from './firebase';
import { MiddlewareHandler } from 'hono';

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

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      },
      401
    );
  }

  const token = authHeader.substring(7);

  try {
    const decodedToken = await auth.verifyIdToken(token);
    
    c.set('user', {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      admin: !!decodedToken.admin,
    });
    
    await next();
  } catch (error) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      },
      401
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
      403
    );
  }

  await next();
};
