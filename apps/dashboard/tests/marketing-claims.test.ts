import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AD_CATEGORIES, GEO_REGIONS } from '@ada/shared';

/**
 * Guards public-facing copy against claims the shipped system cannot back up.
 *
 * Every assertion here corresponds to a claim that was live on birtingur.app and
 * contradicted by the code (see docs/superpowers/plans/2026-07-29-marketing-claims-truthfulness.md).
 * The point is not to police wording but to make a specific falsehood impossible to
 * reintroduce silently — if you are changing an assertion, change the system first.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Loads a dashboard source file as raw text so we can assert on the copy it contains. */
export function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('TermsPage claims match the shipped system', () => {
  const terms = readSource('src/pages/TermsPage.tsx');

  it('does not claim a VAT sales invoice is issued as campaigns run', () => {
    // No invoice-generation code exists anywhere in apps/api.
    expect(terms).not.toContain('Lögbundinn sölureikningur');
  });

  it('does not promise a payout on the first business day of the month', () => {
    // cron-payouts only creates a pending payout; the transfer is manual.
    expect(terms).not.toContain('fyrsta virka dag næsta mánaðar');
  });

  it('does not claim money moves in real time', () => {
    // Accrual runs on a 15-minute cron.
    expect(terms).not.toContain('í rauntíma samkvæmt CPM');
    expect(terms).not.toContain('safnast upp í rauntíma');
  });

  it('does not claim a pricing mode the system does not implement', () => {
    // CPM is locked server-side; createSlot ignores any client price.
    expect(terms).not.toContain('föstu verði');
  });

  it('does not claim every ad needs admin approval', () => {
    // auto_approved creatives skip human review entirely.
    expect(terms).not.toContain('þurfa samþykki kerfisstjóra');
  });

  it('names the embed script by its real filename', () => {
    expect(terms).not.toContain('widget.js');
    expect(terms).toContain('snippet.js');
  });
});

describe('Handbook guides describe real product capabilities', () => {
  const guides = readSource('src/lib/blog-data.ts');
  const blogPost = readSource('src/pages/BlogPost.tsx');

  it('offers no ad category that does not exist', () => {
    expect(AD_CATEGORIES.map((c) => c.slug)).not.toContain('fasteignir');
    expect(guides).not.toContain('fasteignir');
  });

  it('offers no geographic region that does not exist', () => {
    expect(GEO_REGIONS.map((r) => String(r).toLowerCase())).not.toContain('nordurland');
    expect(guides).not.toContain('Norðurland');
    expect(guides).not.toContain('Vesturland');
  });

  it('does not claim statistics are real-time', () => {
    expect(guides).not.toContain('smelli í rauntíma');
  });

  it('does not promise an immediate signup while registration is closed', () => {
    expect(guides).not.toContain('á 1 mínútu');
    expect(blogPost).not.toContain('á 3 mínútum');
  });
});

describe('Landing pages describe statistics honestly', () => {
  const landing = readSource('src/pages/LandingPage.tsx');
  const advertiser = readSource('src/pages/AdvertiserLanding.tsx');

  it('does not claim impressions and clicks are visible in real time', () => {
    expect(landing).not.toContain('smelli í rauntíma');
    expect(advertiser).not.toContain('smelli í rauntíma');
  });

  it('does not promise a 3-minute campaign while registration is closed', () => {
    expect(landing).not.toContain('3 mín');
  });

  // Superseded by b991d78: the forecast computation runs per request, but its
  // inputs are hourly-aggregated stats (and the size variant sits behind a
  // 10-minute cache), and AGENTS.md bans "rauntíma" in public copy outright.
  it('does not call the inventory forecast real-time', () => {
    expect(landing).not.toContain('Rauntíma birtingaspá');
    expect(advertiser).not.toContain('Rauntíma birtingaspá');
  });
});

describe('Prospect pages make no unsupported claims', () => {
  const pages = ['Bjarni', 'Serfraedingar', 'Tryggvi', 'Vibers'].map((name) => ({
    name,
    source: readSource(`src/pages/${name}.tsx`),
  }));

  const each = (assert: (source: string, name: string) => void) =>
    pages.forEach(({ source, name }) => assert(source, name));

  it('does not present Cloudflare Workers as the live serving stack', () => {
    // apps/serving deploys to Vercel; Cloudflare Workers is the unshipped V2.
    each((source, name) => expect(source, name).not.toContain('Cloudflare Workers'));
  });

  it('quotes no unbenchmarked latency figure', () => {
    each((source, name) => expect(source, name).not.toContain('15ms'));
  });

  it('quotes no invented CTR benchmark', () => {
    // Nothing in apps/api computes a platform-wide CTR average.
    each((source, name) => expect(source, name).not.toContain('1.8%'));
  });

  it('does not promise a 3-minute signup while registration is closed', () => {
    each((source, name) => expect(source, name).not.toContain('3 mínútum'));
  });

  it('does not claim statistics are real-time', () => {
    each((source, name) => expect(source, name).not.toContain('Rauntíma'));
    each((source, name) => expect(source, name).not.toContain('rauntíma tölfræði'));
  });

  it('states the real built size of the embed snippet', () => {
    // packages/snippet/dist/snippet.js is 3,105 bytes.
    expect(readSource('src/pages/Vibers.tsx')).not.toContain('1.5 KB');
  });

  it('shows no fabricated data attributed to a named company', () => {
    // Tryggvi.tsx is served at /tryggvi and /datera; naming another live
    // prospect in a fake API response exposes one client to another.
    expect(readSource('src/pages/Tryggvi.tsx')).not.toContain('"Vibers"');
  });
});

/**
 * The owner's standing rule (2026-07-29): speak about the network as something
 * being built, and drop anything questionable. That means no uncited market or
 * competitor statistics, no legal conclusions about GDPR, and no wording that
 * implies an established network of well-known sites — inventory is still being
 * gathered (RoleSelect.tsx says so to visitors).
 */
describe('Copy makes no uncited or legal claims', () => {
  const guides = readSource('src/lib/blog-data.ts');

  it('states no legal conclusion about GDPR or consent banners', () => {
    expect(guides).not.toContain('Samkvæmt Evrópulögum');
    expect(guides).not.toContain('Fullkomið samræmi við GDPR');
  });

  it('quotes no uncited market statistic', () => {
    expect(guides).not.toContain('yfir 50%');
  });

  it('does not assert browsers now block third-party cookies', () => {
    // Google publicly reversed Chrome's third-party-cookie deprecation.
    expect(guides).not.toContain('Chrome sem loka nú');
  });

  it('makes no uncited comparative claim about media agencies', () => {
    expect(guides).not.toContain('berast oft seint');
    expect(guides).not.toContain('hagkvæmari og fljótlegri');
    expect(guides).not.toContain('være'); // also a non-Icelandic typo
  });

  it('does not imply some ad sizes earn more when CPM is flat', () => {
    expect(guides).not.toContain('dýrustu');
  });

  it('does not claim an established network of well-known sites', () => {
    expect(guides).not.toContain('gæðavefjum');
    expect(guides).not.toContain('þekktum íslenskum vefsíðum');
  });

  it('drops absolute cookie-free phrasing outside the ad system', () => {
    // Serving sets no cookies, but the dashboard still uses Firebase auth
    // storage, so an unqualified "100%" overreaches.
    expect(guides).not.toContain('100% kökulaust');
  });
});

describe('Pages present the network as being built, not established', () => {
  const marketingPages = [
    'Bjarni',
    'Serfraedingar',
    'Tryggvi',
    'Vibers',
    'LandingPage',
    'AdvertiserLanding',
    'PublisherLanding',
  ].map((name) => ({ name, source: readSource(`src/pages/${name}.tsx`) }));

  const each = (assert: (source: string, name: string) => void) =>
    marketingPages.forEach(({ source, name }) => assert(source, name));

  it('quotes no uncited statistic about competitors', () => {
    each((source, name) => expect(source, name).not.toContain('8–12 auglýsingar'));
    each((source, name) => expect(source, name).not.toContain('Almennt (fréttalestur'));
  });

  it('claims no unmeasured superiority of the inventory', () => {
    each((source, name) => expect(source, name).not.toContain('margfalt'));
    each((source, name) => expect(source, name).not.toContain('gríðarlega einbeittur'));
  });

  it('drops absolute cookie-free phrasing', () => {
    each((source, name) => expect(source, name).not.toContain('100% kökulaust'));
  });

  it('makes no claim about a named third party’s own product', () => {
    expect(readSource('src/pages/Tryggvi.tsx')).not.toContain('Hins vegar þarf að framkvæma');
  });

  it('offers no revenue-share feature that is not implemented', () => {
    // No affiliate/referral tracking exists in apps/api or packages/shared.
    expect(readSource('src/pages/Vibers.tsx')).not.toContain('affiliate');
  });

  // Icelandic copy is full of accented Latin characters, which makes a
  // Cyrillic homoglyph (а, е, о, с …) invisible on review — it renders
  // identically but breaks search, screen readers and any grep. One slipped
  // in while editing this very copy.
  it('contains no Cyrillic homoglyphs hiding in Icelandic words', () => {
    each((source, name) => expect(source, `${name} contains Cyrillic`).not.toMatch(/[Ѐ-ӿ]/));
    expect(readSource('src/lib/blog-data.ts')).not.toMatch(/[Ѐ-ӿ]/);
  });
});
