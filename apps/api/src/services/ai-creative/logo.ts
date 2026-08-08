import { Resvg } from '@resvg/resvg-js';
import { randomUUID } from 'node:crypto';
import type { GeneratedLogo } from '@ada/shared';
import { ssrfGuardedFetchBinary } from './ssrf.js';
import type { CreativeUploader } from './storage.js';

const LOGO_MAX_BYTES = 1024 * 1024;
const SVG_RASTER_SIZE = 512;
// Ceiling on the rasterized height once `fitTo: { mode: 'width', value:
// SVG_RASTER_SIZE }` scales an extreme-aspect-ratio SVG up. Chosen well above
// any legitimate logo mark's aspect ratio (a 512-wide logo taller than 2048px
// is not a "logo" in any normal sense) but far below the point where the
// RGBA canvas (width * height * 4 bytes) becomes a memory-exhaustion bomb —
// see the CRITICAL-1 finding this guards: a 1x600 viewBox scales to
// 512x307200 (~629MB) with the old unbounded fitTo-width-only logic.
const MAX_RASTER_HEIGHT = 2048;

/** PNG/JPEG magic-byte signatures, checked against the actual bytes
 * regardless of the caller-declared mime — MINOR-4 (adversarial review):
 * without this, a PNG blob labelled `image/jpeg` (or vice versa) would be
 * stored and served under a lying content type. */
function hasPngMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}
function hasJpegMagicBytes(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

// Adversarial re-review (blocking): the SVG raster bomb (CRITICAL-1) had a
// twin in the PNG/JPEG passthrough path — normalizeLogoBuffer stored
// PNG/JPEG bytes undecoded, but resvg still has to decode+rasterize the
// EMBEDDED logo image at banner-render time (templates.ts's `<image>` tag,
// via render.ts's resvg pass). A flat-color PNG compresses extremely well,
// so a 1MB file can legitimately declare pixel dimensions in the tens of
// thousands — same OOM class as the SVG bomb, a different input path. Ceiling
// chosen to match: no legitimate logo mark needs a dimension above this.
const MAX_RASTER_DIMENSION = 4096;

/** Parses PNG width/height straight out of the IHDR chunk header — no
 * decoding. Chunk layout: 8-byte signature, then [4-byte length][4-byte type
 * "IHDR"][4-byte width][4-byte height BE]..., so width/height sit at fixed
 * offsets 16-19 / 20-23 for any valid PNG (IHDR is always the first chunk).
 * Returns null when the buffer is too short or the chunk type isn't IHDR
 * (never throws, matches this module's "always null, never throws" contract). */
function pngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Parses JPEG width/height by scanning markers for the first SOF0/SOF1/SOF2
 * (baseline/extended-sequential/progressive) segment and reading its
 * height/width fields — no decoding. Segment layout after the 2-byte marker:
 * [2-byte length incl. itself][1-byte precision][2-byte height BE][2-byte
 * width BE]... Returns null if SOI is missing, a marker byte is malformed, or
 * the scan runs off the buffer end without finding an SOF segment. */
function jpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) return null; // not a marker — malformed/unparseable
    const marker = buffer[offset + 1]!;
    // Markers with no length-prefixed payload: SOI, TEM, RSTn (0xD0-0xD7).
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) return null; // EOI reached — no SOF segment found
    if (offset + 4 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (offset + 9 > buffer.length) return null;
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (segmentLength < 2) return null; // malformed segment length
    offset += 2 + segmentLength;
  }
  return null;
}

function withinRasterCeiling(dims: { width: number; height: number } | null): boolean {
  if (!dims) return false;
  const { width, height } = dims;
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_RASTER_DIMENSION &&
    height <= MAX_RASTER_DIMENSION
  );
}

/**
 * Normalizes a fetched logo asset to PNG or JPEG bytes, rejecting anything
 * else (`image/gif`, `image/vnd.microsoft.icon`, etc.) — `GeneratedLogoSchema`
 * only accepts `image/png` | `image/jpeg`, so an SVG source is rasterized
 * here via the same `@resvg/resvg-js` path `render.ts` uses for banner
 * compositing, and everything else is unsupported. Returns null (never
 * throws) when the content type is unsupported, the SVG fails to parse, the
 * SVG's aspect ratio would blow up the rasterized canvas past
 * `MAX_RASTER_HEIGHT` once scaled to `SVG_RASTER_SIZE` wide, (PNG/JPEG) the
 * declared mime doesn't match the buffer's actual magic bytes, or (PNG/JPEG)
 * the header-declared pixel dimensions exceed `MAX_RASTER_DIMENSION` — a
 * flat-color PNG/JPEG can compress a huge declared canvas into well under the
 * 1MB fetch/upload cap, and resvg still decodes+rasterizes it at full
 * declared size when compositing the banner (same OOM class as the SVG-bomb
 * fix above, a different input path).
 */
export function normalizeLogoBuffer(
  buffer: Buffer,
  contentType: string,
): { buffer: Buffer; mime: 'image/png' | 'image/jpeg' } | null {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (type === 'image/png') {
    if (!hasPngMagicBytes(buffer) || !withinRasterCeiling(pngDimensions(buffer))) return null;
    return { buffer, mime: 'image/png' };
  }
  if (type === 'image/jpeg' || type === 'image/jpg') {
    if (!hasJpegMagicBytes(buffer) || !withinRasterCeiling(jpegDimensions(buffer))) return null;
    return { buffer, mime: 'image/jpeg' };
  }
  if (type === 'image/svg+xml') {
    try {
      const resvg = new Resvg(buffer.toString('utf-8'), {
        fitTo: { mode: 'width', value: SVG_RASTER_SIZE },
      });
      // `.width`/`.height` report the SVG's INTRINSIC size (pre-`fitTo`) —
      // confirmed empirically, resvg-js applies fitTo at render time, not at
      // construction. Compute what the fitTo-scaled canvas would be and
      // bail BEFORE calling `.render()`, which is the actual allocation.
      const { width: srcW, height: srcH } = resvg;
      if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
        return null;
      }
      const scaledHeight = (SVG_RASTER_SIZE / srcW) * srcH;
      if (!Number.isFinite(scaledHeight) || scaledHeight > MAX_RASTER_HEIGHT) {
        return null;
      }
      return { buffer: Buffer.from(resvg.render().asPng()), mime: 'image/png' };
    } catch {
      return null;
    }
  }
  return null;
}

// IMPORTANT-2 (adversarial review): overall wall-clock budget for
// `acquireScrapedLogo`'s candidate loop. Each candidate can cost up to ~5s
// (ssrfGuardedFetchBinary's own per-request timeout), and even with the
// candidate list now capped at 4 (see `extractLogoCandidates`), serial
// worst-case latency could still stall the `/generate/copy` request for
// ~20s. 15s leaves room for at least 2-3 real attempts while keeping the
// overall request within a sane bound.
const ACQUIRE_DEADLINE_MS = 15_000;

/** Best-effort: tries candidates in order, returns null when none works.
 * Never throws — logo acquisition must not be able to fail the copy step.
 * `deadline` (default: now + ACQUIRE_DEADLINE_MS) is an epoch-ms wall-clock
 * cutoff, exposed as a param (rather than hardcoded) so the loop's
 * deadline-exceeded behavior is directly unit-testable by injecting an
 * already-past value. */
export async function acquireScrapedLogo(params: {
  advertiserId: string;
  candidates: string[];
  uploader: CreativeUploader;
  deadline?: number;
}): Promise<GeneratedLogo | null> {
  const deadline = params.deadline ?? Date.now() + ACQUIRE_DEADLINE_MS;
  for (const candidate of params.candidates) {
    if (Date.now() >= deadline) break;
    try {
      const res = await ssrfGuardedFetchBinary(candidate, { maxBytes: LOGO_MAX_BYTES });
      if (res.truncated || !res.contentType) continue;
      const normalized = normalizeLogoBuffer(res.body, res.contentType);
      if (!normalized || normalized.buffer.length === 0) continue;
      const ext = normalized.mime === 'image/png' ? 'png' : 'jpg';
      const filename = `logo_${randomUUID()}.${ext}`;
      const url = await params.uploader.upload({
        advertiserId: params.advertiserId,
        filename,
        pngBuffer: normalized.buffer,
        contentType: normalized.mime,
      });
      return {
        url,
        storagePath: `creatives/${params.advertiserId}/${filename}`,
        mime: normalized.mime,
        source: 'scraped',
      };
    } catch {
      continue;
    }
  }
  return null;
}
