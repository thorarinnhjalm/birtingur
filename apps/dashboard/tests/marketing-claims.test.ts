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
