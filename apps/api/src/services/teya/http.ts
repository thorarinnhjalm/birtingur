import type { CheckoutSession, TeyaClient } from './index';

export class HttpTeyaClient implements TeyaClient {
  constructor(
    private apiKey: string,
    private baseUrl = process.env.TEYA_BASE_URL ?? 'https://api.teya.com'
  ) {}

  async createCheckoutSession(opts: {
    advertiserId: string;
    amountIsk: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<CheckoutSession> {
    const res = await fetch(`${this.baseUrl}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': opts.idempotencyKey,
      },
      body: JSON.stringify({
        amount: opts.amountIsk,
        currency: 'ISK',
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        metadata: { advertiserId: opts.advertiserId },
      }),
    });

    if (!res.ok) {
      throw new Error(`Teya checkout failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { id: string; url: string };
    return { sessionId: data.id, url: data.url };
  }
}
