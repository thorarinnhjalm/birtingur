export const config = { runtime: 'nodejs' };

export async function GET(req) {
  // Use same auth as cron jobs — Bearer CRON_SECRET
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  const results = {};

  // 1. Redis queue depths
  try {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    const redis = new Redis({ url, token });
    await redis.ping();

    const [statsLen, accrualLen, legacyLen] = await Promise.all([
      redis.llen('events:stats'),
      redis.llen('events:accrual'),
      redis.llen('events:queue'),
    ]);

    // Peek at latest event
    let latestEvent = null;
    if (statsLen > 0) {
      const raw = await redis.lindex('events:stats', 0);
      if (raw) {
        try {
          latestEvent = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          latestEvent = raw;
        }
      }
    }

    const hbNames = ['cron-accrue', 'cron-aggregate', 'cron-refresh-cache', 'cron-payouts'];
    const hbVals = await redis.mget(...hbNames.map((n) => `heartbeat:${n}`));
    const heartbeats = Object.fromEntries(
      hbNames.map((n, i) => [
        n,
        hbVals[i] == null
          ? null
          : { ageMinutes: Math.floor((Date.now() - Number(hbVals[i])) / 60000) },
      ]),
    );

    results.redis = {
      status: 'ok',
      queues: { 'events:stats': statsLen, 'events:accrual': accrualLen, 'events:queue': legacyLen },
      heartbeats,
      latestEvent,
    };
  } catch (err) {
    results.redis = { status: 'error', message: err.message };
  }

  // 2. Env check
  results.env = {
    CRON_SECRET_LENGTH: process.env.CRON_SECRET?.length ?? 0,
    UPSTASH_REDIS_REST_URL_EXISTS: !!process.env.UPSTASH_REDIS_REST_URL,
    KV_REST_API_URL_EXISTS: !!process.env.KV_REST_API_URL,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? null,
    FIREBASE_PRIVATE_KEY_EXISTS: !!process.env.FIREBASE_PRIVATE_KEY,
  };

  // 3. Check Firestore stats for pizzadeig.is today
  try {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
    const db = getFirestore(process.env.FIREBASE_DATABASE_ID || undefined);
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pubId = 'pub_95af8e6a4b0a8a3530ddeede';
    const ref = db.doc(`stats/publishers/${pubId}/${today}`);
    const snap = await ref.get();
    results.firestoreStats = { path: ref.path, exists: snap.exists, data: snap.data() ?? null };
  } catch (err) {
    results.firestoreStats = { status: 'error', message: err.message };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
