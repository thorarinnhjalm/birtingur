import { Hono } from 'hono';
import { CreateWaitlistInputSchema } from '@ada/shared/schemas';
import { COLLECTIONS, waitlistEntryConverter } from '@ada/shared/firestore';
import type { WaitlistEntry } from '@ada/shared/types';
import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';

export const waitlistRoute = new Hono();

// Helper to send welcome email via Resend if RESEND_API_KEY is configured
async function sendWelcomeEmail(email: string, role: string, category?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Waitlist Email] RESEND_API_KEY unset. Skipping email to ${email}`);
    return;
  }

  try {
    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #1e3a8a;">Welcome to Birtingur Early Access!</h2>
        <p>Thank you for joining the global waitlist for Birtingur, the privacy-first category display network.</p>
        <p><strong>Your Registration Details:</strong></p>
        <ul>
          <li><strong>Role:</strong> ${role.toUpperCase()}</li>
          ${category ? `<li><strong>Category:</strong> ${category}</li>` : ''}
        </ul>
        <p>We are expanding early access by region and content category. We will reach out as soon as early access opens for your profile.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b;">100% Cookie-Free & Privacy First • Birtingur</p>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Birtingur Early Access <hello@birtingur.app>',
        to: [email],
        subject: 'Welcome to Birtingur Early Access!',
        html: htmlBody,
      }),
    });
  } catch (err) {
    console.error('[Waitlist Email Error]', err);
  }
}

// POST /v1/waitlist — Public signup endpoint
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

  // Trigger welcome email asynchronously
  sendWelcomeEmail(email, role, category).catch(() => {});

  return c.json(
    {
      success: true,
      message: 'Thank you for joining the waitlist!',
      id,
    },
    201,
  );
});

// GET /v1/waitlist/stats — Aggregated telemetry stats
waitlistRoute.get('/stats', async (c) => {
  const snapshot = await db.collection(COLLECTIONS.waitlist).get();

  let advertisers = 0;
  let publishers = 0;
  let both = 0;
  const categories: Record<string, number> = {};

  snapshot.docs.forEach((doc) => {
    const data = doc.data() as WaitlistEntry;
    if (data.role === 'advertiser') advertisers++;
    else if (data.role === 'publisher') publishers++;
    else if (data.role === 'both') both++;

    if (data.category) {
      const catKey = data.category.toLowerCase().trim();
      categories[catKey] = (categories[catKey] || 0) + 1;
    }
  });

  return c.json({
    total: snapshot.size,
    roles: { advertisers, publishers, both },
    categories,
  });
});
