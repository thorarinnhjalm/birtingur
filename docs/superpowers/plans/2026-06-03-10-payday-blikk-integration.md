# ADA Payday & Blikk Integration Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Implement automated account-to-account (A2A) payments via the Blikk Open Banking API and automated invoicing/VAT bookkeeping via the Payday API. This replaces/augments the initial Teya card payment and manual VAT invoicing flows to minimize transaction fees and streamline accounting operations for the Icelandic market.

**Architecture:** 
1. **Blikk Payment**: Initiates A2A payments directly from the dashboard. When approved by the advertiser in their bank app (via Rafræn skilríki), Blikk calls our webhook `/api/blikk/webhook` which credits the advertiser's ledger.
2. **Payday Invoicing**: Instantly triggered on successful top-ups. The API creates a VSK-compliant paid invoice (`24% VAT`) in Payday on behalf of Birta and dispatches it to the advertiser's kennitala/email.
3. **Mocks & Stubs**: A local stub client for both Payday and Blikk bypasses actual API calls in development/emulator runs.

**Depends on:** Plans #1, #2, #3, #4, #5.

---

## File Structure

```
apps/api/src/
├── services/
│   ├── payday/
│   │   ├── index.ts               # PaydayClient interface & factory
│   │   ├── http.ts                # HttpPaydayClient (OAuth2, Invoice generation)
│   │   └── stub.ts                # StubPaydayClient (local dev mock)
│   └── blikk/
│       ├── index.ts               # BlikkClient interface & factory
│       ├── http.ts                # HttpBlikkClient (A2A payment links)
│       └── stub.ts                # StubBlikkClient (local dev mock)
└── routes/
    └── webhooks/
        └── blikk.ts               # POST /api/blikk/webhook
```

---

## Task 1: Payday API Client & Types

**Files:** `apps/api/src/services/payday/index.ts`, `apps/api/src/services/payday/stub.ts`, `apps/api/src/services/payday/http.ts`, `apps/api/tests/payday.test.ts`

- [ ] **Step 1: Write Unit Test**
  Write `apps/api/tests/payday.test.ts` mocking the OAuth token exchange and verifying that the `HttpPaydayClient` formats invoice requests correctly:
  ```ts
  import { describe, it, expect, vi } from 'vitest';
  import { HttpPaydayClient } from '../src/services/payday/http';

  describe('HttpPaydayClient', () => {
    it('sends invoice payload with correct VAT (24%)', async () => {
      // Mock fetch requests for token and invoice endpoint
      const client = new HttpPaydayClient('client_id', 'client_secret');
      // Assert payload includes correct lines, amount, and customer metadata
    });
  });
  ```

- [ ] **Step 2: Implement Client Interfaces**
  Write `apps/api/src/services/payday/index.ts` defining the invoice payload structure (item name, price, VAT calculation, customer name, kennitala, and email).
  Write `apps/api/src/services/payday/stub.ts` returning mock URLs and saving invoices to an in-memory dictionary.
  Write `apps/api/src/services/payday/http.ts` implementing OAuth2 flow to retrieve Bearer tokens and POSTing to `https://api.payday.is/v1/invoices`.

---

## Task 2: Blikk Payment Integration

**Files:** `apps/api/src/services/blikk/index.ts`, `apps/api/src/services/blikk/stub.ts`, `apps/api/src/services/blikk/http.ts`, `apps/api/tests/blikk.test.ts`

- [ ] **Step 1: Write Unit Test**
  Write `apps/api/tests/blikk.test.ts` testing signature verification and webhook body parsing:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { verifyBlikkSignature } from '../src/services/blikk/webhook';

  describe('verifyBlikkSignature', () => {
    it('validates authentic signatures from Blikk', () => {
      // Implement HMAC-SHA256 signature verification test
    });
  });
  ```

- [ ] **Step 2: Implement Blikk A2A Client**
  Write `apps/api/src/services/blikk/index.ts` defining the PaymentInitiation request schema.
  Write `apps/api/src/services/blikk/http.ts` to connect to `https://api.blikk.tech/v1/payments` to create payment requests with callback webhooks.
  Write `apps/api/src/services/blikk/stub.ts` rendering a mock banking page URL that simulates bank auth success/cancellation callbacks.

---

## Task 3: Top-up & Invoicing Webhook Routing

**Files:** `apps/api/src/routes/webhooks/blikk.ts`, `apps/api/src/routes/wallet.ts`, `apps/api/src/index.ts`

- [ ] **Step 1: Create Webhook Endpoint**
  Write `apps/api/src/routes/webhooks/blikk.ts`. This endpoint processes incoming POST requests from Blikk when an A2A transfer clears:
  * Verify payload signature using the webhook secret.
  * Invoke `topUp(advertiserId, amountIsk, paymentId)` in the wallet service.
  * On success, retrieve the advertiser profile (kennitala, companyName, email) and invoke `payday.createInvoice()` to instantly issue the paid VSK invoice.
  * Return `200 OK`.

- [ ] **Step 2: Mount & Configure Routes**
  * Mount `/api/blikk/webhook` router in `apps/api/src/index.ts`.
  * Update `POST /v1/advertisers/me/wallet/topup` in [wallet.ts](file:///Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/wallet.ts) to accept a preferred payment method parameter (`blikk` or `teya`). If `blikk`, return a Blikk A2A checkout session link.

---

## Task 4: UI integration & local E2E check

**Files:** `apps/dashboard/src/pages/advertiser/Wallet.tsx` (or settings page containing wallet)

- [ ] **Step 1: Update Dashboard Wallet Form**
  * Provide radio buttons/selectors: "Greiða með Blikk (Millifærsla — engin kortagjöld)" and "Kreditkort (Teya)".
  * Route payment generation through the updated REST API.
  * Ensure the payment outcome page displays a downloadable/viewable link to the generated Payday invoice PDF.

- [ ] **Step 2: Verification Run**
  Run all workspace-wide tests and compile production builds:
  ```bash
  npx pnpm test
  npx pnpm typecheck
  npx pnpm build
  ```
