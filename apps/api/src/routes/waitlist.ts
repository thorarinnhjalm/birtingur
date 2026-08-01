import { Hono } from 'hono';
import { CreateWaitlistInputSchema } from '@ada/shared/schemas';
import { COLLECTIONS, waitlistEntryConverter } from '@ada/shared/firestore';
import type { WaitlistEntry } from '@ada/shared/types';
import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';
import { sendWaitlistWelcomeEmail } from '../services/mail.js';
import { createNotification } from '../services/notifications.js';
import { isRedisConfigured, getRedis } from '../lib/redis.js';

export const waitlistRoute = new Hono();

// Simple in-memory fallback rate limiter for waitlist submissions
const memoryRateMap = new Map<string, { count: number; expiresAt: number }>();

async function isRateLimited(key: string): Promise<boolean> {
  const limit = 5; // Max 5 waitlist submissions per hour per IP/Email
  const windowMs = 60 * 60 * 1000;

  if (isRedisConfigured()) {
    try {
      const redis = getRedis();
      const redisKey = `ratelimit:waitlist:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, 3600);
      }
      return count > limit;
    } catch {
      // Fallback to in-memory on Redis error
    }
  }

  const now = Date.now();
  const entry = memoryRateMap.get(key);
  if (!entry || entry.expiresAt < now) {
    memoryRateMap.set(key, { count: 1, expiresAt: now + windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > limit;
}

// POST /v1/waitlist — Public signup endpoint (Rate-limited, Zod-validated, awaited Resend email)
waitlistRoute.post('/', async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown-ip';

  if (await isRateLimited(ip)) {
    return c.json(
      {
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many waitlist submissions from this IP. Please try again later.',
      },
      429,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateWaitlistInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: 'BAD_REQUEST',
        message: 'Invalid waitlist input',
        details: parsed.error.format(),
      },
      400,
    );
  }

  const { email, role, websiteUrl, category, country } = parsed.data;

  // Rate limit by email as well to prevent spamming single address
  if (await isRateLimited(`email:${email}`)) {
    return c.json(
      {
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many submissions for this email address.',
      },
      429,
    );
  }

  // Check if email is already registered on waitlist
  const existing = await db
    .collection(COLLECTIONS.waitlist)
    .where('email', '==', email)
    .limit(1)
    .get();

  if (!existing.empty) {
    return c.json({
      success: true,
      message: 'You are already registered on the waitlist.',
      id: existing.docs[0]!.id,
    });
  }

  const id = generateId('wtl');
  const entry: WaitlistEntry = {
    id,
    email,
    role,
    websiteUrl: websiteUrl || undefined,
    category: category || undefined,
    country: country || undefined,
    createdAt: new Date(),
  };

  await db
    .collection(COLLECTIONS.waitlist)
    .doc(id)
    .withConverter(waitlistEntryConverter)
    .set(entry);

  // Properly AWAITED email send with SENDER_EMAIL fallback from mail.ts
  await sendWaitlistWelcomeEmail(email, role, category);

  // In-app heads-up for admins (same 'admin' sentinel as creatives/support);
  // a failed notification must never fail the signup itself.
  try {
    await createNotification({
      userEmail: 'admin',
      role: 'admin',
      type: 'info',
      title: 'Ný skráning á biðlista',
      message: `${email} skráði sig á enska biðlistann sem ${role}${category ? ` (flokkur: ${category})` : ''}.`,
      link: '/admin',
    });
  } catch (err) {
    console.error('Error creating admin waitlist notification:', err);
  }

  return c.json(
    {
      success: true,
      message: 'Thank you for joining the waitlist!',
      id,
    },
    201,
  );
});
