import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ssrfGuardedFetch,
  ssrfGuardedFetchBinary,
  SsrfBlockedError,
  __testing__,
} from '../src/services/ai-creative/ssrf';

const { isPrivateIp } = __testing__;

// `ssrfGuardedFetchBinary`'s tests below use a plain hostname (example.com)
// rather than a literal IP, so the guard's real DNS resolution step runs —
// mock it the same way `global.fetch` is mocked, resolving to a public IP so
// the tests stay hermetic/offline while still exercising the guard's
// hostname → lookup() → isPrivateIp() path (not just the literal-IP
// shortcut the other tests above take).
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === 'example.com') {
      return [{ address: '93.184.216.34', family: 4 }];
    }
    throw new Error(`unexpected DNS lookup for ${hostname} in tests`);
  }),
}));

describe('SSRF guard: isPrivateIp', () => {
  it('flags loopback addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
  });

  it('flags RFC1918 private ranges', () => {
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('172.16.4.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
  });

  it('flags link-local addresses (incl. cloud metadata 169.254.169.254)', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('flags IPv6 unique-local and IPv4-mapped private addresses', () => {
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('flags IPv4-mapped addresses in their canonical hex-group form (not just dotted-decimal)', () => {
    // WHATWG URL parsing canonicalizes `::ffff:169.254.169.254` to
    // `::ffff:a9fe:a9fe` — a textual/regex check on the dotted-decimal
    // spelling alone would miss this, since that's never what url.hostname
    // actually contains once the guard sees it.
    expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true); // 169.254.169.254 (cloud metadata)
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true); // 127.0.0.1
    expect(isPrivateIp('::ffff:a00:1')).toBe(true); // 10.0.0.1
    expect(isPrivateIp('::ffff:5db8:d822')).toBe(false); // 93.184.216.34 (public)
  });

  it('flags NAT64 and 6to4 embedded-IPv4 private addresses', () => {
    expect(isPrivateIp('64:ff9b::a9fe:a9fe')).toBe(true); // NAT64-embedded 169.254.169.254
    expect(isPrivateIp('2002:0a00:0001::')).toBe(true); // 6to4-embedded 10.0.0.1
  });

  it('allows public addresses', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('93.184.216.34')).toBe(false);
  });
});

describe('SSRF guard: ssrfGuardedFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-https URLs', async () => {
    await expect(ssrfGuardedFetch('http://example.com')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects localhost', async () => {
    await expect(ssrfGuardedFetch('https://localhost/page')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects literal loopback IP', async () => {
    await expect(ssrfGuardedFetch('https://127.0.0.1/page')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects literal private IP', async () => {
    await expect(ssrfGuardedFetch('https://10.0.0.5/page')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects an IPv4-mapped IPv6 literal targeting cloud metadata (regression for the hex-canonicalization bypass)', async () => {
    await expect(
      ssrfGuardedFetch('https://[::ffff:169.254.169.254]/latest/meta-data'),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects link-local metadata IP', async () => {
    await expect(ssrfGuardedFetch('https://169.254.169.254/latest/meta-data')).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it('rejects non-standard ports', async () => {
    // A literal IP sidesteps DNS so this stays hermetic — the port check
    // happens before hostname resolution either way.
    await expect(ssrfGuardedFetch('https://93.184.216.34:8443/page')).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  // The following use literal public IPs (not hostnames) for the "public"
  // side of each redirect so the guard's real DNS resolution step is never
  // exercised here — keeps these tests hermetic/offline. isPrivateIp's own
  // range logic is covered directly above.
  it('rejects a redirect from a public address to a private address', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('https://93.184.216.34/')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://127.0.0.1/internal' },
        });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ssrfGuardedFetch('https://93.184.216.34/')).rejects.toThrow(SsrfBlockedError);
  });

  it('follows a redirect to another public address and returns its body', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('https://93.184.216.34/')) {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://8.8.8.8/final' },
        });
      }
      if (url.startsWith('https://8.8.8.8/')) {
        return new Response('<title>Lokasíða</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ssrfGuardedFetch('https://93.184.216.34/');
    expect(result.body).toContain('Lokasíða');
    expect(result.finalUrl).toBe('https://8.8.8.8/final');
  });

  it('gives up after too many redirects', async () => {
    // Bounces between two public IPs forever — must be stopped by the hop
    // limit, not by a privacy check.
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      const next = url.startsWith('https://93.184.216.34/') ? '8.8.8.8' : '93.184.216.34';
      return new Response(null, { status: 302, headers: { location: `https://${next}/` } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ssrfGuardedFetch('https://93.184.216.34/')).rejects.toThrow(SsrfBlockedError);
  });
});

/** Stubs `global.fetch` to resolve once with the given status/headers/body. */
function mockFetchOnce(opts: { status: number; headers: Record<string, string>; body: Buffer }) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(new Uint8Array(opts.body), { status: opts.status, headers: opts.headers }),
  );
}

describe('ssrfGuardedFetchBinary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns raw bytes and content type', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    mockFetchOnce({ status: 200, headers: { 'content-type': 'image/png' }, body: png });
    const res = await ssrfGuardedFetchBinary('https://example.com/logo.png');
    expect(res.contentType).toBe('image/png');
    expect(Buffer.compare(res.body, png)).toBe(0);
    expect(res.truncated).toBe(false);
  });

  it('marks bodies over the cap as truncated', async () => {
    mockFetchOnce({
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.alloc(64 * 1024, 1),
    });
    const res = await ssrfGuardedFetchBinary('https://example.com/big.png', {
      maxBytes: 16 * 1024,
    });
    expect(res.truncated).toBe(true);
  });

  it('applies the SSRF guard (https only)', async () => {
    await expect(ssrfGuardedFetchBinary('http://example.com/logo.png')).rejects.toThrow(
      SsrfBlockedError,
    );
  });
});
