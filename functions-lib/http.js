// Shared configuration and request helpers for the export delivery endpoints.

/** How long an emailed download link stays valid. */
export const EXPORT_LINK_TTL_DAYS = 7;

/**
 * Upload ceiling. Cloudflare caps a Function's request body at 100 MB, and the
 * video is PUT through the Function so it can be authorised against the job
 * token. 1440p/30fps studio exports land well under this; 4K does not, and
 * would need presigned multipart uploads straight to R2 instead.
 */
export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

/** Jobs one IP may create per rolling day. */
export const MAX_JOBS_PER_IP_PER_DAY = 5;

/** Maximum JSON request size for endpoints that only accept small metadata bodies. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large');
    this.name = 'RequestBodyTooLargeError';
  }
}

export function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(code, message, status) {
  return json({ error: code, message }, status);
}

export function methodNotAllowed(allowed) {
  return json(
    { error: 'method_not_allowed', message: `Use ${allowed}` },
    405,
    { Allow: allowed },
  );
}

export function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || null;
}

export function getCountry(request) {
  // `request.cf` is absent under `wrangler pages dev` unless proxying is on.
  return request.cf?.country || request.headers.get('CF-IPCountry') || null;
}

/**
 * Absolute origin for links that appear in email. Prefers an explicit
 * PUBLIC_ORIGIN so a preview deployment never mails links pointing at its own
 * ephemeral hostname.
 */
export function getPublicOrigin(request, env) {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  return new URL(request.url).origin;
}

export function nowIso() {
  return new Date().toISOString();
}

export function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function readJsonBody(request, { requireContentType = true } = {}) {
  const contentType = request.headers.get('Content-Type') || '';
  if (requireContentType && !contentType.includes('application/json')) return null;

  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      chunks.push(chunk);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const body = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === 'object' ? body : null;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw error;
    return null;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Guards every endpoint that touches the leads database. A missing binding is
 * a deployment mistake, and returning 503 makes it obvious rather than
 * surfacing as an opaque exception inside a handler.
 */
export function requireLeadsDb(env) {
  if (!env.LEADS_DB) {
    return errorResponse('not_configured', 'Lead storage is not configured', 503);
  }
  return null;
}
