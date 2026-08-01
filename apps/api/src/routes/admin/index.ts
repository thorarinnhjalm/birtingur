import { Hono } from 'hono';
import { requireAdmin, requireAuth, type Env } from '../../lib/auth.js';
import { db } from '../../lib/firebase.js';
import { getAdminStats } from '../../services/admin-stats.js';
import { adminReviewRoutes } from './review.js';
import { adminPayoutsRoutes } from './payouts.js';
import { adminEntitiesRoutes } from './entities.js';
import { refreshAllActiveSlotCaches } from '../../services/cache-refresh.js';
import { previewCronBlockReason } from '../../lib/preview-guard.js';

export const adminRoutes = new Hono<Env>();

// Require admin access on all admin sub-routes
adminRoutes.use('/*', requireAuth, requireAdmin);

adminRoutes.route('/review-queue', adminReviewRoutes);
adminRoutes.route('/payouts', adminPayoutsRoutes);
adminRoutes.route('/entities', adminEntitiesRoutes);

// Reaches the same cache-refresh function the cron-refresh-cache preview
// guard protects — needs the same fail-closed check so a preview deploy
// can't push cache writes into the shared production Redis via this admin
// route. See lib/preview-guard.ts.
adminRoutes.post('/cache/refresh', async (c) => {
  const blocked = previewCronBlockReason();
  if (blocked) {
    return c.json({ error: 'preview_blocked', reason: blocked }, 403);
  }
  const count = await refreshAllActiveSlotCaches();
  return c.json({ success: true, count });
});

adminRoutes.get('/stats', async (c) => {
  const stats = await getAdminStats();
  return c.json(stats);
});

adminRoutes.get('/waitlist/stats', async (c) => {
  const snapshot = await db.collection('waitlist').get();

  let advertisers = 0;
  let publishers = 0;
  let both = 0;
  const categories: Record<string, number> = {};

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.role === 'advertiser') advertisers++;
    else if (data.role === 'publisher') publishers++;
    else if (data.role === 'both') both++;

    if (data.category) {
      const catKey = String(data.category).toLowerCase().trim();
      categories[catKey] = (categories[catKey] || 0) + 1;
    }
  });

  return c.json({
    total: snapshot.size,
    roles: { advertisers, publishers, both },
    categories,
  });
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
    CRON_SECRET_EXISTS: !!process.env.CRON_SECRET,
    CRON_SECRET_LENGTH: process.env.CRON_SECRET?.length ?? 0,
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

  // 5. Test Redis connection + queue depths
  try {
    const { getRedis } = await import('../../lib/redis.js');
    const { EVENT_QUEUE_STATS, EVENT_QUEUE_ACCRUAL, EVENT_QUEUE_LEGACY } =
      await import('@ada/shared');
    const redis = getRedis();
    await redis.ping();

    // Queue depths — this is THE critical diagnostic:
    // If events pile up in stats queue, cron-aggregate isn't running/draining.
    // If stats queue is 0, either serving isn't writing or cron just drained it.
    const [statsLen, accrualLen, legacyLen] = await Promise.all([
      redis.llen(EVENT_QUEUE_STATS),
      redis.llen(EVENT_QUEUE_ACCRUAL),
      redis.llen(EVENT_QUEUE_LEGACY),
    ]);

    // Peek at the most recent event (if any) in the stats queue
    let latestEvent: any = null;
    if (statsLen > 0) {
      const raw = await redis.lindex(EVENT_QUEUE_STATS, 0);
      if (raw) {
        try {
          latestEvent = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          latestEvent = raw;
        }
      }
    }

    diagnosticResult.redis = {
      status: 'ok',
      queues: {
        'events:stats': statsLen,
        'events:accrual': accrualLen,
        'events:queue (legacy)': legacyLen,
      },
      latestEventInStatsQueue: latestEvent,
    };
  } catch (err: any) {
    diagnosticResult.redis = {
      status: 'error',
      message: err.message,
      stack: err.stack,
    };
  }

  // 6. Check Firestore stats path for a known publisher
  try {
    const today = new Date().toISOString().split('T')[0]!.replace(/-/g, '');
    const testPublisherId = 'pub_95af8e6a4b0a8a3530ddeede'; // pizzadeig.is
    const ref = db.doc(`stats/publishers/${testPublisherId}/${today}`);
    const snap = await ref.get();
    diagnosticResult.firestoreStats = {
      path: ref.path,
      exists: snap.exists,
      data: snap.data() ?? null,
    };
  } catch (err: any) {
    diagnosticResult.firestoreStats = {
      status: 'error',
      message: err.message,
    };
  }

  return c.json(diagnosticResult);
});
