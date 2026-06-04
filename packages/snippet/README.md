# Birtingur - Ad Delivery Snippet

A minified, ultra-lightweight, self-contained JavaScript script (IIFE) designed to be embedded directly into publisher websites. It detects publisher CMP consent, fetches eligible display ads from the Birtingur Serving API, and injects them securely via iframe elements.

## Key Features

- **Ultra-Lightweight**: Compiles to under 1.5 KB minified and gzipped (well below the 4 KB budget limit).
- **Fail-Silent**: Wrapped in strict global `try-catch` structures. Under any network issues, api errors, or missing elements, the script fails silently to ensure the publisher site's layout and functionality are completely unaffected.
- **Secure Sandbox**: Ad creatives are rendered inside isolated `<iframe>` elements to prevent script injection (XSS) and layout shifts.
- **CMP Detection**: Automatically checks for standard IAB TCF CMP consent flags (`window.__cmpConsent`) before sending telemetry tracking identifiers.

---

## Build and Compilation

The snippet is compiled using **esbuild** for maximum minification and dead-code elimination.

### Build Scripts

Run the following build command from the workspace root:

```bash
npx pnpm --filter @ada/snippet build
```

This executes the script defined in `esbuild.config.mjs`:

- Outputs to `dist/index.js`
- Formatted as a minified self-invoking function (IIFE)
- Target: `es6` (compatible with all modern browsers)

---

## Cloudflare R2 CDN Upload & Deployment

Once compiled, `dist/index.js` should be uploaded to a Cloudflare R2 bucket mapped to a custom domain (e.g., `cdn.birtingur.is/v1/snippet.js`).

### Upload Configuration

When uploading to Cloudflare R2, configure the following metadata headers to ensure optimal caching and browser delivery:

| Header                        | Value                                   | Purpose                                                |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `Content-Type`                | `application/javascript; charset=utf-8` | Prevents browser script MIME-type issues               |
| `Cache-Control`               | `public, max-age=3600, s-maxage=86400`  | Caches snippet in browser for 1 hour, CDN for 24 hours |
| `Access-Control-Allow-Origin` | `*`                                     | Permits cross-origin inclusion                         |

### Publishing via wrangler CLI

To deploy automatically using the wrangler CLI:

```bash
wrangler r2 object put "birtingur-cdn/v1/snippet.js" --file="./dist/index.js" --content-type="application/javascript; charset=utf-8"
```

---

## Fail-Silent & Layout Resilience

Ad platforms must never break host sites. The Birtingur snippet employs several strategies to achieve this:

1. **Global Try-Catch Wrapper**:
   All execution logic resides in a top-level try-catch block. Any exceptions (e.g., legacy browser APIs) are captured and suppressed. No errors leak to the browser console.
2. **Network Timeout Handling**:
   Ad fetching uses the standard `AbortController` API with a strict **2-second timeout**. If the Birtingur Serving API does not respond within this window, the fetch is aborted silently.
3. **Graceful UI Rendering**:
   If an ad fails to load, or if the server returns `{ "empty": true }`, the target script container is untouched. The container maintains `display: none` or collapses naturally, avoiding blank white spaces on the publisher page.
