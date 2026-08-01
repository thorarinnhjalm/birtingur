export function updateSEO(title: string, description: string, canonicalPath: string = '') {
  document.title = title;

  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.setAttribute('name', 'description');
    document.head.appendChild(metaDesc);
  }
  metaDesc.setAttribute('content', description);

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  const baseUrl = 'https://www.birtingur.app';
  canonical.setAttribute('href', `${baseUrl}${canonicalPath}`);

  // Keep social/share tags in sync with the page (the prerender stitch does the
  // same server-side; this covers client-side SPA navigation).
  const setProp = (property: string, content: string) => {
    const el = document.querySelector(`meta[property="${property}"]`);
    if (el) el.setAttribute('content', content);
  };
  setProp('og:title', title);
  setProp('twitter:title', title);
  setProp('og:description', description);
  setProp('twitter:description', description);
  setProp('og:url', `${baseUrl}${canonicalPath}`);
  setProp('twitter:url', `${baseUrl}${canonicalPath}`);
}
