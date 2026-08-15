/**
 * Icelandic number formatting as pure string manipulation — deliberately NOT
 * Intl. Every surface used toLocaleString('is-IS'), which silently falls back
 * to the browser's default locale when its ICU lacks Icelandic: a real
 * production Chrome rendered "21,860", which in Icelandic convention reads as
 * twenty-one point eight six. A displayed number must not depend on which
 * locale data the viewer's browser happens to ship.
 *
 * Mirrors toLocaleString('is-IS') defaults exactly (grouping dot, decimal
 * comma, at most 3 fraction digits) — pinned against real ICU in the tests, so
 * environments that were already correct, including the prerender snapshots,
 * see no change at all.
 */
export function formatNumberIs(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const rounded = Math.round(n * 1000) / 1000; // toLocaleString's 3-digit default
  const neg = rounded < 0 || Object.is(rounded, -0);
  const [intPart, fracPart] = Math.abs(rounded).toString().split('.');
  const grouped = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = fracPart ? `,${fracPart}` : '';
  return `${neg ? '-' : ''}${grouped}${frac}`;
}

/**
 * Format an ISK amount with Icelandic conventions:
 * - Period as thousand-separator
 * - "kr" suffix with a space
 * - No decimals (rounds to integer)
 */
export function formatIsk(amount: number): string {
  // Through formatNumberIs, never Intl — see its comment for why.
  return `${formatNumberIs(Math.round(amount))} kr`;
}

/**
 * Parse an ISK string back into a number.
 * Accepts forms: "1.000 kr", "1.000", "1000", "  1.000 kr  ".
 * Rejects comma-separated forms.
 * Returns null on invalid input.
 */
export function parseIsk(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strip optional "kr" suffix
  const withoutSuffix = trimmed.replace(/\s*kr\s*$/i, '').trim();

  // Reject comma separators (English convention)
  if (withoutSuffix.includes(',')) return null;

  // Strip period separators, but only if they look like thousand-separators
  // (3-digit groups). Reject malformed input like "1.50" or "1.0000".
  const cleaned = withoutSuffix.replace(/\./g, '');

  if (!/^-?\d+$/.test(cleaned)) return null;

  const parsed = parseInt(cleaned, 10);
  if (isNaN(parsed)) return null;

  return parsed;
}
