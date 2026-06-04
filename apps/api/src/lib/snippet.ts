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

  const cdnBase = process.env.CDN_BASE_URL ?? 'https://cdn.birtingur.app';
  return `<div data-adplatform-slot="${escapedSlotId}"${widthAttr}${heightAttr}></div>\n<script async src="${cdnBase}/widget.js"></script>`;
}
