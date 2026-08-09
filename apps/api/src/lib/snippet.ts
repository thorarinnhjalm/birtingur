export interface SnippetOptions {
  slotId: string;
  width?: number;
  height?: number;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateSnippet(options: SnippetOptions): string {
  const escapedSlotId = escapeHtml(options.slotId);
  const widthAttr = options.width != null ? ` data-adplatform-width="${options.width}"` : '';
  const heightAttr = options.height != null ? ` data-adplatform-height="${options.height}"` : '';

  // This string is what a publisher pastes into their own site, so a wrong
  // host here is a silent, permanent breakage on someone else's page. There
  // is no separate CDN: the serving app's build copies the compiled snippet
  // to `public/widget.js` (see apps/serving/package.json), so it is served
  // from the serving origin itself. The old default, `cdn.birtingur.app`, was
  // never attached to a deployment and returned Vercel's DEPLOYMENT_NOT_FOUND.
  const cdnBase = process.env.CDN_BASE_URL ?? 'https://serving.birtingur.app';
  return `<div data-adplatform-slot="${escapedSlotId}"${widthAttr}${heightAttr}></div>\n<script async src="${cdnBase}/widget.js"></script>`;
}
