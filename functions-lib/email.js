// Outbound email, behind one function so the provider is a single-file swap.
//
// Cloudflare Email Sending supports both a Workers binding and a REST API.
// This project uses the REST API with its existing account token integration;
// Resend remains a fallback for explicit Cloudflare authentication failures.

const DEFAULT_FROM = 'TrailReplay <videos@mail.trailreplay.com>';

const CLOUDFLARE_SEND_ENDPOINT = (accountId) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      'No email provider configured: set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_EMAIL_API_TOKEN, or RESEND_API_KEY',
    );
    this.name = 'EmailNotConfiguredError';
    this.safeToRetry = true;
  }
}

/**
 * Sends one transactional email. Returns `{ provider, messageId }`.
 *
 * Throws on failure rather than swallowing it, so the caller can record the
 * job as undelivered — a lost video must be visible in the data instead of
 * looking successful.
 */
export async function sendEmail(env, message) {
  const payload = {
    from: env.EMAIL_FROM || DEFAULT_FROM,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  };

  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_EMAIL_API_TOKEN) {
    try {
      return await sendViaCloudflare(env, payload);
    } catch (error) {
      // Authentication failures happen before Cloudflare accepts a message,
      // so retrying through the configured fallback cannot double-deliver it.
      // Do not fall back for ambiguous provider/network failures.
      if (env.RESEND_API_KEY && error instanceof CloudflareEmailError && error.authenticationFailure) {
        return sendViaResend(env, payload);
      }
      throw error;
    }
  }

  if (env.RESEND_API_KEY) {
    return sendViaResend(env, payload);
  }

  throw new EmailNotConfiguredError();
}

class CloudflareEmailError extends Error {
  constructor(detail, authenticationFailure, safeToRetry) {
    super(`Cloudflare Email Sending rejected the message: ${detail}`.slice(0, 400));
    this.name = 'CloudflareEmailError';
    this.authenticationFailure = authenticationFailure;
    this.safeToRetry = safeToRetry;
  }
}

async function sendViaCloudflare(env, payload) {
  const response = await fetch(CLOUDFLARE_SEND_ENDPOINT(env.CLOUDFLARE_ACCOUNT_ID), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_EMAIL_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);

  // Cloudflare answers 200 with `success: false` for some rejections, so the
  // status alone is not enough to call this delivered.
  if (!response.ok || result?.success !== true) {
    const detail = result?.errors?.map((error) => error.message).join('; ')
      || `HTTP ${response.status}`;
    // A structured rejection before a 5xx/429 is known not to be accepted.
    // A network failure, rate limit, server error, or malformed success reply
    // might follow acceptance, so the caller must not resend automatically.
    const safeToRetry = result?.success === false
      && response.status < 500
      && ![408, 409, 429].includes(response.status);
    const authenticationFailure = safeToRetry && (response.status === 401
      || response.status === 403
      || /authenticat|invalid.*token|token.*invalid/i.test(detail));
    throw new CloudflareEmailError(detail, authenticationFailure, safeToRetry);
  }

  return { provider: 'cloudflare', messageId: result?.result?.message_id ?? null };
}

async function sendViaResend(env, payload) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`Resend rejected the message (${response.status}): ${detail}`.slice(0, 400));
    // These explicit client/auth/validation responses are pre-acceptance.
    // Treat 408, 409, 429 and all 5xx as uncertain without provider-side
    // idempotency, even if the HTTP request itself returned a response.
    error.safeToRetry = [400, 401, 403, 404, 422].includes(response.status);
    throw error;
  }

  const result = await response.json().catch(() => ({}));
  return { provider: 'resend', messageId: result?.id ?? null };
}
