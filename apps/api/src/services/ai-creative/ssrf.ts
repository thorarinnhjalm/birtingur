import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { URL } from 'node:url';

/**
 * SSRF guard for `extractSiteContext`, which fetches an arbitrary,
 * advertiser-supplied landing-page URL server-side. Policy, deliberately
 * strict since this is the one place in the API that fetches attacker-
 * influenced URLs on the server's behalf:
 *  - https only (no plaintext http, no other schemes)
 *  - standard port only (443, or none specified) — blocks scanning internal
 *    services on nonstandard ports (redis 6379, ssh 22, internal admin UIs...)
 *  - hostname must not be a literal loopback/private/link-local address
 *  - DNS resolution (all A/AAAA records) must not land on a private range
 *    either — blocks DNS-rebinding style bypasses of a hostname check
 *  - redirects are followed manually (max 3 hops), re-validating every hop
 *    the same way, so a public URL can't 302 into a private one
 */
export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 512 * 1024;

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => parseInt(p, 10) || 0);
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

const PRIVATE_V4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local
  ['172.16.0.0', 12],
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_V4_RANGES.some(([base, bits]) => inCidr4(ip, base, bits));
}

/**
 * Expands a valid IPv6 literal (any textual form: full, "::"-compressed, or
 * with a dotted-decimal IPv4 tail) into its 16 raw bytes, or null if it
 * doesn't parse. Byte-level parsing (rather than matching the textual form)
 * matters because the WHATWG URL parser canonicalizes IPv6 hosts into
 * compressed hex-group form — `::ffff:169.254.169.254` becomes
 * `::ffff:a9fe:a9fe` by the time `url.hostname` sees it — so a check that
 * only recognized the dotted-decimal spelling of an IPv4-mapped address
 * would miss every address actually reachable through a `new URL(...)`,
 * which is exactly how every hostname/IP here arrives.
 */
function ipv6ToBytes(ip: string): number[] | null {
  const zoneStripped = ip.split('%')[0] ?? ip; // strip a zone id (fe80::1%eth0) defensively
  let head = zoneStripped;
  let tail = '';
  const dcIdx = zoneStripped.indexOf('::');
  if (dcIdx !== -1) {
    head = zoneStripped.slice(0, dcIdx);
    tail = zoneStripped.slice(dcIdx + 2);
  }

  function expandGroups(part: string): string[] {
    return part.length === 0 ? [] : part.split(':');
  }

  const headGroups = expandGroups(head);
  const tailGroups = expandGroups(tail);

  // A dotted-decimal IPv4 tail (e.g. "...:ffff:1.2.3.4") counts as the last
  // two 16-bit groups.
  function inflateV4Tail(groups: string[]): string[] | null {
    const last = groups[groups.length - 1];
    if (last && last.includes('.')) {
      const octets = last.split('.').map((o) => parseInt(o, 10));
      if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
        return null;
      }
      const hi = ((octets[0]! << 8) | octets[1]!).toString(16);
      const lo = ((octets[2]! << 8) | octets[3]!).toString(16);
      return [...groups.slice(0, -1), hi, lo];
    }
    return groups;
  }

  const headInflated = inflateV4Tail(headGroups);
  const tailInflated = inflateV4Tail(tailGroups);
  if (headInflated === null || tailInflated === null) return null;

  let allGroups: string[];
  if (dcIdx !== -1) {
    const missing = 8 - (headInflated.length + tailInflated.length);
    if (missing < 0) return null;
    allGroups = [...headInflated, ...Array(missing).fill('0'), ...tailInflated];
  } else {
    allGroups = headInflated;
  }
  if (allGroups.length !== 8) return null;

  const bytes: number[] = [];
  for (const g of allGroups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

function isPrivateIpv6(ip: string): boolean {
  const bytes = ipv6ToBytes(ip);
  if (!bytes) return true; // unparseable — refuse rather than guess

  const isZero = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);

  if (isZero(0, 16)) return true; // :: (unspecified)
  if (isZero(0, 15) && bytes[15] === 1) return true; // ::1 (loopback)
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if ((bytes[0]! & 0xfe) === 0xfc) return true; // fc00::/7 unique local

  // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible-deprecated (::/96,
  // embedded directly) — both carry the real IPv4 address in the last 4
  // bytes; unwrap and re-check it against the IPv4 private ranges.
  const isV4Mapped = isZero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff;
  const isV4Compatible = isZero(0, 12) && !isZero(12, 16);
  if (isV4Mapped || isV4Compatible) {
    const v4 = bytes.slice(12, 16).join('.');
    return isPrivateIpv4(v4);
  }

  // NAT64 well-known prefix 64:ff9b::/96 also embeds a real IPv4 address.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
    const v4 = bytes.slice(12, 16).join('.');
    return isPrivateIpv4(v4);
  }

  // 6to4 (2002::/16) embeds an IPv4 address right after the prefix.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    const v4 = bytes.slice(2, 6).join('.');
    return isPrivateIpv4(v4);
  }

  return false;
}

function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true; // not a recognizable IP — refuse rather than guess
}

/** Validates scheme/port and resolves DNS, throwing SsrfBlockedError on any violation. */
async function assertSafeUrl(url: URL): Promise<void> {
  if (url.protocol !== 'https:') {
    throw new SsrfBlockedError('Only https:// URLs are allowed');
  }
  if (url.port && url.port !== '443') {
    throw new SsrfBlockedError('Only the standard https port (443) is allowed');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 literal brackets

  if (hostname === 'localhost') {
    throw new SsrfBlockedError('localhost is not allowed');
  }

  // If the hostname is itself a literal IP, check it directly; otherwise resolve.
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SsrfBlockedError(`URL resolves to a disallowed address: ${hostname}`);
    }
    return;
  }

  let records: Array<{ address: string }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError(`Could not resolve hostname: ${hostname}`);
  }
  if (records.length === 0) {
    throw new SsrfBlockedError(`Hostname did not resolve to any address: ${hostname}`);
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new SsrfBlockedError(
        `Hostname ${hostname} resolves to a disallowed address: ${record.address}`,
      );
    }
  }
}

export interface SafeFetchResult {
  body: string;
  finalUrl: string;
  contentType: string | null;
}

export interface SafeBinaryFetchResult {
  body: Buffer;
  finalUrl: string;
  contentType: string | null;
  truncated: boolean; // true when the cap cut the body off — callers must discard
}

/**
 * Shared redirect/validation loop behind both `ssrfGuardedFetch` (text) and
 * `ssrfGuardedFetchBinary` (raw bytes, for logo downloads) — the SSRF guard
 * and manual-redirect handling only need to exist once. Caps response size
 * at `maxBytes` and total time; `truncated` tells the caller the returned
 * buffer stopped short of the full body.
 */
async function ssrfGuardedFetchCore(
  urlString: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; finalUrl: string; contentType: string | null; truncated: boolean }> {
  let current: URL;
  try {
    current = new URL(urlString);
  } catch {
    throw new SsrfBlockedError('Invalid URL');
  }

  for (let hop = 0; ; hop++) {
    await assertSafeUrl(current);

    if (hop > MAX_REDIRECTS) {
      throw new SsrfBlockedError('Too many redirects');
    }

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: globalThis.AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'BirtingurCreativeBot/1.0 (+https://adplatform.is)' },
      });
    } catch (err) {
      throw new SsrfBlockedError(
        `Failed to fetch landing page: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new SsrfBlockedError('Redirect with no Location header');
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new SsrfBlockedError(`Landing page returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type');

    // Cap body size manually — Content-Length can't be trusted (may be absent
    // or wrong), so read the stream and stop once the cap is hit.
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return {
        buffer: Buffer.from(text, 'utf-8'),
        finalUrl: current.toString(),
        contentType,
        truncated: false,
      };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { buffer, finalUrl: current.toString(), contentType, truncated };
  }
}

/**
 * Fetches `urlString` with the SSRF guard applied to the initial URL and to
 * every redirect hop (manual redirect handling — `fetch`'s automatic
 * redirect-following would re-request a validated-then-redirected URL without
 * ever re-checking it). Caps response size and total time.
 */
export async function ssrfGuardedFetch(urlString: string): Promise<SafeFetchResult> {
  const { buffer, finalUrl, contentType } = await ssrfGuardedFetchCore(urlString, MAX_BODY_BYTES);
  return { body: buffer.toString('utf-8'), finalUrl, contentType };
}

const MAX_BINARY_BYTES = 1024 * 1024;

/**
 * Same SSRF guard and redirect handling as `ssrfGuardedFetch`, but returns
 * raw bytes instead of decoding as utf-8 text — for fetching binary assets
 * (advertiser logos) rather than HTML landing pages. Defaults to a 1 MB cap,
 * smaller than a typical landing-page HTML cap since logos are small images.
 */
export async function ssrfGuardedFetchBinary(
  urlString: string,
  opts?: { maxBytes?: number },
): Promise<SafeBinaryFetchResult> {
  const { buffer, finalUrl, contentType, truncated } = await ssrfGuardedFetchCore(
    urlString,
    opts?.maxBytes ?? MAX_BINARY_BYTES,
  );
  return { body: buffer, finalUrl, contentType, truncated };
}

// Exported for unit tests that need to exercise the guard directly without a network call.
export const __testing__ = { assertSafeUrl, isPrivateIp };
