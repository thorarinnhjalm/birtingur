/**
 * Icelandic number formatting as pure string manipulation — deliberately NOT
 * Intl. These components run embedded on PUBLISHERS' OWN pages, in whatever
 * browser their visitors bring; Intl.NumberFormat('is-IS') silently falls back
 * to the browser's default locale when its ICU lacks Icelandic, and "21,860"
 * in Icelandic convention reads as twenty-one point eight six.
 *
 * Duplicated from @ada/shared's formatNumberIs on purpose: this bundle is
 * dependency-free by design (see package.json — no runtime deps), and a copy
 * with a test costs less than coupling the embed bundle to the monorepo's
 * dependency root. Keep the two implementations in step.
 */
export function formatNumberIs(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const rounded = Math.round(n * 1000) / 1000;
  const neg = rounded < 0 || Object.is(rounded, -0);
  const [intPart, fracPart] = Math.abs(rounded).toString().split('.');
  const grouped = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = fracPart ? `,${fracPart}` : '';
  return `${neg ? '-' : ''}${grouped}${frac}`;
}
