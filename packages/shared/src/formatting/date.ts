type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/**
 * Format a date as dd.MM.yyyy (Icelandic convention).
 * Uses UTC to ensure consistent output across server/client timezones.
 */
export function formatDate(input: DateInput): string {
  const d = toDate(input);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Format a date relative to a reference point (default: now).
 * Returns:
 *   "í dag" / "í gær" / "á morgun"
 *   "fyrir N dögum" / "eftir N daga" (for 2-7 days)
 *   formatDate(d) for 8+ days
 */
export function formatRelative(input: DateInput, reference: DateInput = new Date()): string {
  const d = toDate(input);
  const ref = toDate(reference);

  // Compare by UTC day boundaries
  const dDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const refDay = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  const diffDays = Math.round((dDay - refDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'í dag';
  if (diffDays === -1) return 'í gær';
  if (diffDays === 1) return 'á morgun';
  if (diffDays >= -7 && diffDays <= -2) return `fyrir ${Math.abs(diffDays)} dögum`;
  if (diffDays >= 2 && diffDays <= 7) return `eftir ${diffDays} daga`;

  return formatDate(d);
}
