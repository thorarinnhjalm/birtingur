import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendWelcomePublisherEmail, sendWelcomeAdvertiserEmail } from '../src/services/mail';

describe('Mail Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it('logs to console and does not fetch when RESEND_API_KEY is not defined', async () => {
    delete process.env.RESEND_API_KEY;
    const consoleSpy = vi.spyOn(console, 'log');

    await sendWelcomePublisherEmail('test@test.is', 'Test Publisher', 'test.is');

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Tölvupóstur skrifaður í Console (Vantar RESEND_API_KEY)]'),
    );
  });

  it('calls fetch with the correct payload when RESEND_API_KEY is defined', async () => {
    process.env.RESEND_API_KEY = 're_testkey';
    process.env.SENDER_EMAIL = 'Birtingur <velkomin@birtingur.is>';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'ok',
    });
    vi.stubGlobal('fetch', mockFetch);

    await sendWelcomeAdvertiserEmail('test@advertiser.is', 'Test Fyrirtæki');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer re_testkey',
          'Content-Type': 'application/json',
        },
        body: expect.any(String),
      }),
    );

    const callArgs = mockFetch.mock.calls[0];
    const bodyObj = JSON.parse(callArgs[1].body);
    expect(bodyObj.from).toBe('Birtingur <velkomin@birtingur.is>');
    expect(bodyObj.to).toEqual(['test@advertiser.is']);
    expect(bodyObj.subject).toBe(
      'Velkomin(n) í Birting – Komdu þér á framfæri á íslenskum vefjum! 🎯',
    );
    expect(bodyObj.html).toContain('Test Fyrirtæki');
  });
});
