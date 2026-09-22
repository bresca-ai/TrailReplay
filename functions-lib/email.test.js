import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailNotConfiguredError, sendEmail } from './email.js';

const message = {
  to: 'rider@example.com',
  subject: 'Your video',
  html: '<p>Ready</p>',
  text: 'Ready',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendEmail', () => {
  it('uses Cloudflare first and reads its current message_id response field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      result: {
        delivered: ['rider@example.com'],
        message_id: 'cf-message-1',
        permanent_bounces: [],
        queued: [],
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendEmail({
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_EMAIL_API_TOKEN: 'email-token',
      RESEND_API_KEY: 'fallback-token',
    }, message)).resolves.toEqual({ provider: 'cloudflare', messageId: 'cf-message-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-id/email/sending/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer email-token' }),
      }),
    );
  });

  it('surfaces a Cloudflare rejection instead of silently falling back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      success: false,
      errors: [{ message: 'Sender domain not verified' }],
    })));

    await expect(sendEmail({
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_EMAIL_API_TOKEN: 'email-token',
      RESEND_API_KEY: 'fallback-token',
    }, message)).rejects.toMatchObject({ safeToRetry: true });
  });

  it('treats an uncertain Cloudflare server response as unsafe to resend or fall back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: false, errors: [{ message: 'Temporary upstream error' }],
    }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendEmail({
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_EMAIL_API_TOKEN: 'email-token',
      RESEND_API_KEY: 'fallback-token',
    }, message)).rejects.toMatchObject({ safeToRetry: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats an ambiguous Cloudflare timeout response as unsafe to resend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      success: false, errors: [{ message: 'Request timed out' }],
    }, { status: 408 })));

    await expect(sendEmail({
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_EMAIL_API_TOKEN: 'email-token',
    }, message)).rejects.toMatchObject({ safeToRetry: false });
  });

  it('falls back to Resend when Cloudflare rejects its credentials', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: false,
        errors: [{ message: 'Authentication error' }],
      }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ id: 'resend-message-2' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendEmail({
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_EMAIL_API_TOKEN: 'invalid-email-token',
      RESEND_API_KEY: 'fallback-token',
    }, message)).resolves.toEqual({ provider: 'resend', messageId: 'resend-message-2' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.resend.com/emails');
  });

  it('uses Resend when Cloudflare Email Sending is not configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 'resend-message-1' })));

    await expect(sendEmail({ RESEND_API_KEY: 'fallback-token' }, message))
      .resolves.toEqual({ provider: 'resend', messageId: 'resend-message-1' });
  });

  it('fails clearly when neither provider is configured', async () => {
    await expect(sendEmail({}, message)).rejects.toBeInstanceOf(EmailNotConfiguredError);
  });
});
