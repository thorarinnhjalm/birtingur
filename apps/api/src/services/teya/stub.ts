import type { CheckoutSession, TeyaClient } from './index';
import { randomBytes } from 'crypto';
import { topUp } from '../wallet';

export class StubTeyaClient implements TeyaClient {
  async createCheckoutSession(opts: {
    advertiserId: string;
    amountIsk: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<CheckoutSession> {
    const sessionId = 'sess_' + randomBytes(12).toString('hex');

    // Automatically credit the mock wallet for developer testing
    await topUp(opts.advertiserId, opts.amountIsk, sessionId);

    return {
      sessionId,
      url: opts.successUrl,
    };
  }
}
