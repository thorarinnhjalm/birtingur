export type VisitorRegion = 'capital' | 'countryside' | 'unknown';

// Höfuðborgarsvæðið. Normalized and mapped to ASCII representation.
const CAPITAL_CITIES = [
  'reykjavik',
  'kopavogur',
  'hafnarfjordur',
  'gardabaer',
  'mosfellsbaer',
  'seltjarnarnes',
  'alftanes',
];

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/æ/g, 'ae')
    .replace(/ö/g, 'o');
}

export function regionFromHeaders(headers: Record<string, string | undefined>): VisitorRegion {
  const city = headers['x-vercel-ip-city'];
  if (!city) return 'unknown';
  return CAPITAL_CITIES.includes(normalise(city)) ? 'capital' : 'countryside';
}
