export function getClientIp(headers: Record<string, string | undefined>): string {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }

  const realIp = normalized['x-real-ip'];
  if (realIp) return realIp.trim();

  const forwardedFor = normalized['x-forwarded-for'];
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return '127.0.0.1';
}
