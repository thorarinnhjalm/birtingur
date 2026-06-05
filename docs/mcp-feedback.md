# Developer & AI Feedback: Birtingur MCP & Serving API Improvements

This document lists the 10 friction points encountered during the integration of the Birtingur ad platform (using the MCP server and Serving API) into the client website `pizzadeig.is`. These insights serve as direct feedback to improve the Developer Experience (DX) and reliability for both human developers and AI coding agents.

---

## 1. Precise Response-Shape Documentation (Critical)
* **Problem**: The documentation for `/v1/ad` implied that empty slots would return a fallback structure (`{ creativeId: "cre_fallback_transparent", ... }`), but the API actually returned `{ "empty": true }`. This discrepancy caused client-side runtime crashes when trying to access `.startsWith()` on undefined properties.
* **Solution**: The MCP tool schema and Serving API spec must clearly document and validate *both* filled and empty JSON shapes. The tool schema should use Zod's `z.union` to define:
  1. **Filled Slot**: `{ creativeId: string, imageUrl: string, clickUrl: string, width: number, height: number, impressionPixel: string, ttl: number }`
  2. **Empty Slot**: `{ empty: true }`

## 2. Clear "Empty State Contract"
* **Problem**: There was ambiguity about what publishers should do when a slot is empty. Options like "collapsing the container", "showing fallback UI", or "custom placeholders" were mentioned, but choosing the wrong one (like custom styled slots) caused page pollution and layout shift.
* **Solution**: Explicitly document the "empty state contract" for headless/hybrid integrations. The spec should clearly state: *"If the API returns `{ empty: true }`, render an invisible wrapper matching the slot dimensions (e.g. using a 1x1 transparent spacer) to reserve layout space and prevent layout shifts (CLS)."*

## 3. Pageview & Inventory Tracking Endpoint
* **Problem**: When a slot is empty, the API returned no `impressionPixel`, so the client did not trigger any tracking. As a result, the platform has no way of measuring total site pageviews/inventory, leaving advertisers unaware of the potential reach.
* **Solution**: The MCP/Serving spec should either:
  1. Always return a tracking pixel (e.g., an `impressionPixel` with `type=pageview` and `creativeId=cre_fallback_transparent`) even for empty slots, or
  2. Document a separate `/v1/pageview?slot=...` telemetry endpoint that the client should ping on page load.

## 4. Consistent Click-URL Formats
* **Problem**: Serving API documentation suggested prepending the serving base URL to `clickUrl`, but some campaigns returned absolute URLs (e.g., `https://birtingur.app`), while others returned relative paths. This forced manual runtime path resolution (`startsWith('http')`) in the client.
* **Solution**: Standardize `clickUrl` in the API response. Either:
  1. Always return fully qualified absolute URLs, or
  2. Explicitly document that clients must check and handle both absolute and relative URLs.

## 5. Official React / Next.js Component Reference
* **Problem**: Every publisher integrating the Serving API has to build their own `<BirtingurAdSlot>` component from scratch, which is prone to edge-case bugs (e.g., missing consent handling, layout shifts, or empty-state crashes).
* **Solution**: Provide an official React/Next.js reference component in the documentation or MCP instructions. This copy-pasteable reference should handle:
  * Loading state (with placeholder skeleton).
  * Safe rendering of empty state (transparent spacer).
  * Relative vs. absolute click URLs.
  * Lazy-loading of tracking pixels.

## 6. Viewability & Impression Timing Rules
* **Problem**: Triggering the `impressionPixel` immediately when the React component mounts is prone to "impression fraud/inflation" because the slot might be far below the fold and never seen by the user.
* **Solution**: Standardize and document viewability rules. Reference the IAB standard (e.g., *50% of pixels visible for at least 1 continuous second*) and provide guidelines on using the `IntersectionObserver` API in client components before loading the tracking pixel.

## 7. Clarify TTL Semantics
* **Problem**: The Serving API response returns a `ttl` field (e.g., `ttl: 30`). It was unclear whether this means the client should cache the response for 30 seconds, poll again after 30 seconds, or if it indicates the cache freshness in Redis.
* **Solution**: Explicitly document the `ttl` semantics. For example: *"The `ttl` field indicates cache validity in seconds. Clients should cache this ad locally for the duration of the TTL before requesting a new creative."*

## 8. CORS & Privacy Consent Specification
* **Problem**: There was no explicit documentation stating that `serving.birtingur.app` supports CORS from any publisher domain. Additionally, while `consent=none` was mentioned in examples, other valid options (like `consent=full`, GDPR/TCF strings, etc.) were not defined.
* **Solution**: Document all supported HTTP headers, CORS policies, and valid `consent` parameter options in the Serving API spec.

## 9. Global Zod Schema Mismatches
* **Problem**: Legacy database documents or schema changes caused the MCP server to throw `categories: Required` validation errors on endpoints that didn't even require parameters (like `get_stats`). This blocked the AI from making any subsequent calls.
* **Solution**: Ensure Zod schemas in the MCP server match the database's flexible nature. Use `.optional()` or `.default()` for fields that may be missing in legacy collections or records, and test tool validations against representative mock databases.

## 10. Top-Level MCP Instructions
* **Problem**: AI coding assistants lacked a high-level workflow roadmap for utilizing the Birtingur MCP server, leading to trial-and-error attempts.
* **Solution**: Add a top-level `instructions` or `readme` tool/description to the MCP server. This should guide the AI on the recommended workflow (e.g., *"1. Register publisher, 2. Create slots, 3. Retrieve snippet, 4. Implement hybrid serving"*).
