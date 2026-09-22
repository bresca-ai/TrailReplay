// POST /api/exports — register a studio export before rendering starts.
//
// Called *before* the browser renders, not after. A studio export takes several
// minutes and can be abandoned; creating the lead up front means an abandoned
// render still leaves a usable record, which is the entire point of the flow.

import {
  EXPORT_LINK_TTL_DAYS,
  MAX_JOBS_PER_IP_PER_DAY,
  errorResponse,
  getClientIp,
  getCountry,
  isoDaysFromNow,
  json,
  methodNotAllowed,
  nowIso,
  readJsonBody,
  RequestBodyTooLargeError,
  requireLeadsDb,
} from '../../functions-lib/http.js';
import { createToken, hashToken } from '../../functions-lib/tokens.js';
import {
  isDisposableEmail,
  normalizeEmail,
  normalizeLocale,
  sanitizeRenderSettings,
} from '../../functions-lib/validation.js';
import { CONSENT_TEXT_VERSION, allowsPreTickedMarketing } from '../../functions-lib/consent.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const notConfigured = requireLeadsDb(env);
  if (notConfigured) return notConfigured;

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse('payload_too_large', 'Request body is too large', 413);
    }
    throw error;
  }
  if (!body) return errorResponse('bad_request', 'Expected a JSON body', 400);

  const email = normalizeEmail(body.email);
  if (!email) return errorResponse('invalid_email', 'Enter a valid email address', 400);
  if (isDisposableEmail(email)) {
    return errorResponse('disposable_email', 'Use an address you can actually receive mail at', 400);
  }

  const country = getCountry(request);
  const clientIp = getClientIp(request);

  // Anyone may opt in explicitly, EU included — the geography rule governs
  // only whether the box may start *pre-ticked* (see functions-lib/consent.js).
  // Recording which of the two this was is what makes the consent auditable.
  const marketingOptIn = body.marketingConsent === true;
  const preTickAllowed = allowsPreTickedMarketing(country);

  const rateLimited = await exceedsIpQuota(env.LEADS_DB, clientIp);
  if (rateLimited) {
    return errorResponse('rate_limited', 'Too many exports from this network today', 429);
  }

  const jobId = crypto.randomUUID();
  const jobToken = createToken();
  const jobTokenHash = await hashToken(jobToken);
  const settings = sanitizeRenderSettings(body.settings);
  const createdAt = nowIso();
  const expiresAt = isoDaysFromNow(EXPORT_LINK_TTL_DAYS);

  const statements = [
    env.LEADS_DB.prepare(`
      INSERT INTO leads (
        email, created_at, locale, country,
        marketing_opted_in_at, consent_text_version, consent_default_ticked, consent_ip,
        export_count, last_export_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(email) DO UPDATE SET
        export_count = export_count + 1,
        last_export_at = excluded.last_export_at,
        locale = COALESCE(excluded.locale, leads.locale),
        country = COALESCE(excluded.country, leads.country),
        -- Opting in again after unsubscribing is a fresh, deliberate act, so it
        -- clears the unsubscribe. Everything else is left alone.
        marketing_opted_in_at = COALESCE(leads.marketing_opted_in_at, excluded.marketing_opted_in_at),
        marketing_confirmed_at = CASE
          WHEN excluded.marketing_opted_in_at IS NOT NULL
            AND leads.marketing_unsubscribed_at IS NOT NULL THEN NULL
          ELSE leads.marketing_confirmed_at END,
        marketing_unsubscribed_at = CASE
          WHEN excluded.marketing_opted_in_at IS NOT NULL THEN NULL
          ELSE leads.marketing_unsubscribed_at END,
        consent_text_version = COALESCE(excluded.consent_text_version, leads.consent_text_version),
        consent_default_ticked = CASE
          WHEN excluded.marketing_opted_in_at IS NOT NULL THEN excluded.consent_default_ticked
          ELSE leads.consent_default_ticked END,
        consent_ip = COALESCE(excluded.consent_ip, leads.consent_ip)
    `).bind(
      email,
      createdAt,
      normalizeLocale(body.locale),
      country,
      marketingOptIn ? createdAt : null,
      marketingOptIn ? CONSENT_TEXT_VERSION : null,
      marketingOptIn && preTickAllowed ? 1 : 0,
      marketingOptIn ? clientIp : null,
      createdAt,
    ),
    env.LEADS_DB.prepare(`
      INSERT INTO export_jobs (
        id, email, created_at, status, quality, quality_mode, aspect_ratio,
        fps, duration_ms, job_token_hash, client_ip, expires_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      jobId, email, createdAt,
      settings.quality, settings.qualityMode, settings.aspectRatio,
      settings.fps, settings.durationMs, jobTokenHash, clientIp, expiresAt,
    ),
  ];

  await env.LEADS_DB.batch(statements);

  return json({
    jobId,
    jobToken,
    uploadUrl: `/api/exports/${jobId}/upload`,
    completeUrl: `/api/exports/${jobId}/complete`,
    expiresAt,
  }, 201);
}

async function exceedsIpQuota(db, clientIp) {
  if (!clientIp) return false;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM export_jobs WHERE client_ip = ? AND created_at > ?')
    .bind(clientIp, since)
    .first();
  return (row?.count ?? 0) >= MAX_JOBS_PER_IP_PER_DAY;
}
