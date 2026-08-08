import { Resvg } from '@resvg/resvg-js';
import { randomUUID } from 'node:crypto';
import type { GeneratedLogo } from '@ada/shared';
import { ssrfGuardedFetchBinary } from './ssrf.js';
import type { CreativeUploader } from './storage.js';

const LOGO_MAX_BYTES = 1024 * 1024;
const SVG_RASTER_SIZE = 512;

/**
 * Normalizes a fetched logo asset to PNG or JPEG bytes, rejecting anything
 * else (`image/gif`, `image/vnd.microsoft.icon`, etc.) — `GeneratedLogoSchema`
 * only accepts `image/png` | `image/jpeg`, so an SVG source is rasterized
 * here via the same `@resvg/resvg-js` path `render.ts` uses for banner
 * compositing, and everything else is unsupported. Returns null (never
 * throws) when the content type is unsupported or the SVG fails to parse.
 */
export function normalizeLogoBuffer(
  buffer: Buffer,
  contentType: string,
): { buffer: Buffer; mime: 'image/png' | 'image/jpeg' } | null {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (type === 'image/png') return { buffer, mime: 'image/png' };
  if (type === 'image/jpeg' || type === 'image/jpg') return { buffer, mime: 'image/jpeg' };
  if (type === 'image/svg+xml') {
    try {
      const resvg = new Resvg(buffer.toString('utf-8'), {
        fitTo: { mode: 'width', value: SVG_RASTER_SIZE },
      });
      return { buffer: Buffer.from(resvg.render().asPng()), mime: 'image/png' };
    } catch {
      return null;
    }
  }
  return null;
}

/** Best-effort: tries candidates in order, returns null when none works.
 * Never throws — logo acquisition must not be able to fail the copy step. */
export async function acquireScrapedLogo(params: {
  advertiserId: string;
  candidates: string[];
  uploader: CreativeUploader;
}): Promise<GeneratedLogo | null> {
  for (const candidate of params.candidates) {
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
