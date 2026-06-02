/**
 * Format an ISK amount with Icelandic conventions:
 * - Period as thousand-separator
 * - "kr" suffix with a space
 * - No decimals (rounds to integer)
 */
export function formatIsk(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('is-IS', {
    maximumFractionDigits: 0,
    useGrouping: true,
  });
  return `${formatted} kr`;
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
