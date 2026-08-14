import { createHash } from 'crypto';
import { getRedis } from './redis.js';

export function hashVisitorToken(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

const TOKEN_RE = /^[a-f0-9]{12}$/;

/**
 * Resolves the visitor id for an ad request.
 *
 * The ONLY identifier is the first-party token the snippet keeps in the publisher's
 * own localStorage and passes as `?vid=`; the snippet mints it exclusively under full
 * consent (`getVisitorId` in packages/snippet), so a present token already implies
 * consent. The serving origin deliberately sets no cookie of its own — it is a
 * different origin from the publisher, so any cookie it set would be a cross-site
 * (third-party) cookie and would falsify the network's cookie-free guarantee.
 *
 * With no token we return '' rather than generating one: a server-minted id would be
 * a tracking identifier by another name, and callers treat '' as "no frequency
 * capping, nothing to record" (see routes/impression.ts).
 */
export function getVisitorToken(clientToken?: string): string {
  if (clientToken && TOKEN_RE.test(clientToken)) return clientToken;
  return '';
}

/**
 * Impressions this visitor has been shown today, keyed by CAMPAIGN id.
 *
 * Fields were keyed by creative id until 2026-08-14. That was equivalent while a
 * campaign could only place one creative in a slot; once a campaign contributes
 * every variant, a per-creative key multiplies an advertiser's daily exposure by
 * its variant count (see SelectionContext.visitorImpressionsToday in
 * lib/select.ts). Both sides of the counter moved together — nothing reads the
 * old creative-keyed fields, so the worst a leftover hash from before the deploy
 * can do is let a visitor see a few extra ads for the rest of that one day.
 */
export async function getVisitorImpressionsToday(token: string): Promise<Record<string, number>> {
  const key = `vimp:${token}:${todayKey()}`;
  const raw = await getRedis().hgetall<Record<string, string>>(key);
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = Number(v) || 0;
  }
  return out;
}

export async function recordVisitorImpression(token: string, campaignId: string): Promise<void> {
  const key = `vimp:${token}:${todayKey()}`;
  await getRedis().hincrby(key, campaignId, 1);
  await getRedis().expire(key, 86400 * 2); // expire in 2 days
}

function todayKey(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}
