# Full-code review findings — 2026-08-03

Scope: full test-suite run (all 9 suites) plus a three-track review (API churn,
dashboard, repo-wide silent-failure/auth sweep). Everything in "Fixed" shipped
on branch `fix/review-findings-2026-08-03`. Items under "Open" are NOT fixed;
each is marked **[verified]** (read end-to-end by the primary reviewer) or
**[traced]** (traced by a review agent with file:line, spot-checked only —
re-verify before acting).

## Fixed in this branch

- **extendCampaign funds-gate serialization** (`apps/api/src/services/campaigns.ts`):
  the transaction wrote `fundsVersion` on the advertiser doc without reading it,
  so a concurrent `createCampaign` that committed first was invisible (phantom
  insert vs. the wallet queries) and both fund holds could commit — double-spend.
  Now reads `advRef` in-transaction like create/update do. [verified]
- **Waitlist rate limiter**: `ip:`/`email:` key namespacing (spoofed
  x-forwarded-for `email:victim@…` could lock a victim's address out),
  self-healing TTL after failed EXPIRE (was: permanent 429 for that key),
  bounded in-memory fallback map, `category` capped at 80 chars. [verified]
- **Admin waitlist stats aggregation**: null-prototype accumulator — caller
  text like `constructor`/`__proto__` corrupted or silently dropped counts.
  [verified]
- **Dashboard prototype-slug crash**: `/en/guides/constructor` and
  `/en/categories/constructor` resolved to inherited Object members and
  white-screened the SPA (no error boundary). hasOwnProperty guards. [verified]
- **7 of 12 landing category chips** led to "Category Not Found" (only 5
  category pages exist); chips now filtered against real pages. Stale
  "10 Guides" CTAs now computed (12). [verified]
- **/handbaekur order**: newest posts sorted first (was: append order).
  Clipboard-share guard (non-secure contexts), scroll-to-top on /en and /faq,
  guide not-found view got header/footer, admin waitlist block shows
  loading/error instead of a confident 0, and `VITE_API_BASE` uses `??` so an
  _explicitly empty_ value means same-origin (unset still defaults to
  localhost:3001). [verified]
- **e2e suite resurrected**: Playwright was collecting vitest files
  (testMatch), and the spec used the demo backdoor removed in 0c0c70a against
  production auth. Now runs on the auth emulator with provisioned verified
  accounts; 3/3 green. [verified]
- **CLAUDE.md restored on disk** — it had an uncommitted on-disk deletion from
  an unknown session; git content never changed, so nothing ships in this
  branch for it (a fresh clone was never affected). [verified]
- Note: the extendCampaign fix has NO deterministic regression test — the
  existing "serializes extend against a concurrent create" test is
  order-dependent and passed both before and after the fix. Forcing the
  phantom-insert interleaving deterministically on the emulator is an open
  follow-up. [verified]

## Open — money-path architecture (prioritized)

1. **`chargeCampaign` overdraft race** (`apps/api/src/services/wallet.ts`
   ~:219): ledger-sum → balance check → bare `appendLedger` set, no
   transaction. Two concurrent charges both pass the check; wallet goes
   negative. The campaign create/update/extend paths use transactions +
   `fundsVersion` for exactly this; the accrual charge path does not.
   [verified]
2. **`topUp` idempotency race** (`wallet.ts` ~:175): duplicate-check is a
   query followed by an unrelated write. Teya webhook redelivery/retry can
   double-credit a card payment. Deterministic doc id (e.g. keyed on
   `teyaTxnId`) + `create()` closes it. [verified]
3. **`markPayoutCompleted` double-submit** (`apps/api/src/services/payouts.ts`
   ~:82): no guard on current status — marking an already-completed payout
   completed appends a second negative ledger entry (publisher debited twice).
   [verified]
4. **Accrual pop-before-process** (`apps/api/src/services/accrual.ts` ~:30):
   RPOP removes up to 500 events before any charge/credit happens; a mid-batch
   crash permanently loses popped events (some charged, none credited →
   `money_conservation_mismatch` with no repair path). Unparseable payloads are
   dropped with only console.warn. [verified]
5. **Serve-time budget writes are fire-and-forget**
   (`apps/serving/src/routes/impression.ts` ~:97-116): `void logEvent`,
   `void decrementBudget`, `void incrementPaceSpent` in the response path — a
   lambda freeze after the pixel returns drops the charge/pace decrement (and
   `logEvent`'s two LPUSHes can split: stats sees the impression, accrual
   never does). Needs `waitUntil` or awaiting before responding. [verified]

## Open — silent-failure and robustness backlog

- `accrual.ts` `getRedis()` catch → `return 0` masks missing Redis env as
  "queue empty", and `ops-alerts.ts` no-ops without Redis, so the dead-man's
  switch disables itself in the same scenario. Same class as the 2026-06-10
  markadssetning incident. [traced]
- `cache-refresh.ts` per-slot catch returns success count only; converter
  regression → 0 refreshed, heartbeat still green, network stops serving with
  no alert. [traced]
- `mail.ts` never throws → ops-alert emails and welcome emails fail silently
  (missing/revoked RESEND_API_KEY reports success). [traced]
- `domain-classifier.ts` falls back to keyword classification with no log on
  non-ok Gemini responses — fabricated-confidence categories route money.
  [traced]
- `apps/mcp/server.ts` scope-fetch failure registers zero tools on a
  successful handshake. [traced]
- `approvals.ts` whole-doc `set()` can clobber concurrent accrual budget
  updates (the pattern campaigns.ts explicitly migrated away from). [traced]
- `generateMonthlyPayouts` has no `(publisherId, period)` idempotency — rerun
  duplicates pending payouts. [traced]
- Teya webhook ignores `checkout.failed` (no record, no notification).
  [traced]
- `POST /v1/support/public-messages` is public with NO rate limit (waitlist
  got one; this endpoint writes a doc + admin notification per call).
  [traced]
- Cosmetic: nonexistent Tailwind classes (`slate-650`, `primary-800`,
  `primary-300`, …) render as no-ops across the English pages; no hreflang
  between is/en. [traced]
- Prerender capture browser formats `is-IS` numbers with COMMAS (missing ICU
  in the Playwright chromium build): `/auglysendur` snapshots ship "27,273",
  "15,000" etc. — wrong decimal semantics in Icelandic. The new blog line was
  switched to a deterministic manual formatter; the systemic fix is a
  full-ICU capture browser or manual formatting in all marketing copy.
  [verified]

## Test-suite status (2026-08-03)

api 442 · serving 72 · shared 92 · widgets 60 · snippet 18 · mcp 16 ·
firestore-rules 9 · dashboard unit 60 · e2e 3 — all green after the fixes
(709 unit/integration + 3 e2e). `pnpm verify` green.
