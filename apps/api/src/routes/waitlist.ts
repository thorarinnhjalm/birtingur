import { Hono } from 'hono';
import { CreateWaitlistInputSchema } from '@ada/shared/schemas';
import { COLLECTIONS, waitlistEntryConverter } from '@ada/shared/firestore';
import type { WaitlistEntry } from '@ada/shared/types';
import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';

export const waitlistRoute = new Hono();

waitlistRoute.post('/', async (c) => {
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

  // Check if email is already registered on waitlist
  const existing = await db
    .collection(COLLECTIONS.waitlist)
    .where('email', '==', email)
    .limit(1)
    .get();

  if (!existing.empty) {
    // Return success idempotently to avoid leaking waitlist status
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

  return c.json(
    {
      success: true,
      message: 'Thank you for joining the waitlist!',
      id,
    },
    201,
  );
});
