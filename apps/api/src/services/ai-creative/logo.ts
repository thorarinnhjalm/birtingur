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

/**
 * Normalizes a fetched logo asset to PNG or JPEG bytes, rejecting anything
 * else (`image/gif`, `image/vnd.microsoft.icon`, etc.) — `GeneratedLogoSchema`
 * only accepts `image/png` | `image/jpeg`, so an SVG source is rasterized
 * here via the same `@resvg/resvg-js` path `render.ts` uses for banner
 * compositing, and everything else is unsupported. Returns null (never
 * throws) when the content type is unsupported, the SVG fails to parse, the
 * SVG's aspect ratio would blow up the rasterized canvas past
 * `MAX_RASTER_HEIGHT` once scaled to `SVG_RASTER_SIZE` wide, or (PNG/JPEG)
 * the declared mime doesn't match the buffer's actual magic bytes.
 */
export function normalizeLogoBuffer(
  buffer: Buffer,
  contentType: string,
): { buffer: Buffer; mime: 'image/png' | 'image/jpeg' } | null {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (type === 'image/png') {
    return hasPngMagicBytes(buffer) ? { buffer, mime: 'image/png' } : null;
  }
  if (type === 'image/jpeg' || type === 'image/jpg') {
    return hasJpegMagicBytes(buffer) ? { buffer, mime: 'image/jpeg' } : null;
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
