import { Hono } from 'hono';
import { requireAdmin, requireAuth, type Env } from '../../lib/auth.js';
import { db } from '../../lib/firebase.js';
import { getAdminStats } from '../../services/admin-stats.js';
import { adminReviewRoutes } from './review.js';
import { adminPayoutsRoutes } from './payouts.js';
import { adminEntitiesRoutes } from './entities.js';

export const adminRoutes = new Hono<Env>();

// Require admin access on all admin sub-routes
adminRoutes.use('/*', requireAuth, requireAdmin);

adminRoutes.route('/review-queue', adminReviewRoutes);
adminRoutes.route('/payouts', adminPayoutsRoutes);
adminRoutes.route('/entities', adminEntitiesRoutes);

adminRoutes.get('/stats', async (c) => {
  const stats = await getAdminStats();
  return c.json({ stats });
});

adminRoutes.get('/diagnostics', async (c) => {
  const diagnosticResult: Record<string, any> = {};

  // 1. Env vars status (safe masking)
  diagnosticResult.env = {
    VERCEL: process.env.VERCEL ?? null,
    NODE_ENV: process.env.NODE_ENV ?? null,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? null,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ?? null,
    FIREBASE_DATABASE_ID: process.env.FIREBASE_DATABASE_ID ?? null,
    FIREBASE_PRIVATE_KEY_EXISTS: !!process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_PRIVATE_KEY_LENGTH: process.env.FIREBASE_PRIVATE_KEY?.length ?? 0,
    UPSTASH_REDIS_REST_URL_EXISTS: !!process.env.UPSTASH_REDIS_REST_URL,
    KV_REST_API_URL_EXISTS: !!process.env.KV_REST_API_URL,
  };

  // 2. Test Firestore connection
  try {
    const collections = await db.listCollections();
    diagnosticResult.firestore = {
      status: 'ok',
      collections: collections.map((col) => col.id),
    };
  } catch (err: any) {
    diagnosticResult.firestore = {
      status: 'error',
      message: err.message,
      stack: err.stack,
    };
  }

  // 3. Test Slots fetching specifically
  try {
    const slotsSnap = await db.collection('slots').get();
    diagnosticResult.slotsQuery = {
      status: 'ok',
      count: slotsSnap.size,
    };
  } catch (err: any) {
    diagnosticResult.slotsQuery = {
      status: 'error',
      message: err.message,
      stack: err.stack,
    };
  }

  // 4. Test slots with converter
  try {
    const { listAllSlots } = await import('../../services/slots.js');
    const slots = await listAllSlots();
    diagnosticResult.slotsWithConverter = {
      status: 'ok',
      count: slots.length,
    };
  } catch (err: any) {
    diagnosticResult.slotsWithConverter = {
      status: 'error',
      message: err.message,
      stack: err.stack,
    };
  }

  // 5. Test Redis connection
  try {
    const { getRedis } = await import('../../lib/redis.js');
    const redis = getRedis();
    await redis.ping();
    diagnosticResult.redis = { status: 'ok' };
  } catch (err: any) {
    diagnosticResult.redis = {
      status: 'error',
      message: err.message,
      stack: err.stack,
    };
  }

  return c.json(diagnosticResult);
});

