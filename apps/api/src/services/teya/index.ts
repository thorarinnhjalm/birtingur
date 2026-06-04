export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export interface TeyaClient {
  createCheckoutSession(opts: {
    advertiserId: string;
    amountIsk: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<CheckoutSession>;
}

export { StubTeyaClient } from './stub.js';
export { HttpTeyaClient } from './http.js';
