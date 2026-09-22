// PUT /api/exports/:jobId/upload — store the rendered video.
//
// The body streams straight into R2 rather than being buffered, so a 60-80 MB
// studio export does not have to fit in the Function's memory. It still passes
// through the Function (instead of a presigned URL) so the job token can
// authorise it; that caps the file at Cloudflare's request body limit. See
// MAX_UPLOAD_BYTES.

import {
  MAX_UPLOAD_BYTES,
  errorResponse,
  json,
  methodNotAllowed,
  requireLeadsDb,
} from '../../../../functions-lib/http.js';
import { verifyToken } from '../../../../functions-lib/tokens.js';

export async function onRequest({ request, env, params }) {
  if (request.method !== 'PUT') return methodNotAllowed('PUT');

  const notConfigured = requireLeadsDb(env);
  if (notConfigured) return notConfigured;
  if (!env.EXPORTS_BUCKET) {
    return errorResponse('not_configured', 'Video storage is not configured', 503);
  }

  const job = await env.LEADS_DB
    .prepare('SELECT id, status, job_token_hash, object_key, size_bytes, expires_at FROM export_jobs WHERE id = ?')
    .bind(params.jobId)
    .first();

  // Same response for "no such job" and "wrong token" so the endpoint cannot be
  // used to discover which job ids exist.
  const token = bearerToken(request);
  if (!job || !(await verifyToken(token, job.job_token_hash))) {
    return errorResponse('not_found', 'Unknown export job', 404);
  }

  if (Date.parse(job.expires_at) < Date.now()) {
    return errorResponse('expired', 'This export expired before it was uploaded', 410);
  }

  // A retry after a completed upload must not stream another body to R2. The
  // completion endpoint owns delivery; this response only acknowledges the
  // object already accepted by the job row.
  if (job.status !== 'pending') {
    if (['uploaded', 'emailing', 'emailed'].includes(job.status)
      && job.object_key && Number.isFinite(job.size_bytes) && job.size_bytes > 0) {
      return verifiedUploadedResponse(job, env.EXPORTS_BUCKET);
    }
    return errorResponse('already_uploaded', 'This export was already uploaded', 409);
  }

  const declaredSize = Number(request.headers.get('Content-Length'));
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    return errorResponse('length_required', 'Content-Length is required', 411);
  }
  if (declaredSize > MAX_UPLOAD_BYTES) {
    return errorResponse(
      'too_large',
      `Video is larger than the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit`,
      413,
    );
  }
  if (!request.body) return errorResponse('bad_request', 'Missing request body', 400);
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'video/mp4') {
    return errorResponse('unsupported_media_type', 'Studio delivery only accepts MP4 video', 415);
  }

  // Every concurrent request writes its own object. D1 chooses one key below;
  // a failed or losing attempt can then delete its key without touching the
  // accepted video.
  const objectKey = `exports/${job.id}/${crypto.randomUUID()}.mp4`;
  await env.EXPORTS_BUCKET.put(objectKey, request.body, {
    httpMetadata: {
      contentType: 'video/mp4',
      contentDisposition: `attachment; filename="trail-replay-${job.id}.mp4"`,
    },
  });

  // Verified from R2 rather than trusting Content-Length, so the recorded size
  // is what actually landed.
  const stored = await env.EXPORTS_BUCKET.head(objectKey);
  if (!stored || stored.size !== declaredSize) {
    await env.EXPORTS_BUCKET.delete(objectKey);
    return errorResponse('upload_incomplete', 'The uploaded video could not be verified', 502);
  }

  const result = await env.LEADS_DB
    .prepare("UPDATE export_jobs SET status = 'uploaded', object_key = ?, size_bytes = ? WHERE id = ? AND status = 'pending'")
    .bind(objectKey, stored.size, job.id)
    .run();

  if (result.success && result.meta?.changes === 1) {
    return uploadedResponse({ ...job, object_key: objectKey, size_bytes: stored.size });
  }
  // An ambiguous database result is deliberately left for lifecycle cleanup:
  // deleting this object could erase the accepted upload if D1 committed it.
  if (!result.success || result.meta?.changes !== 0) {
    throw new Error('Could not determine whether the export upload was accepted');
  }

  await env.EXPORTS_BUCKET.delete(objectKey);
  const accepted = await env.LEADS_DB
    .prepare('SELECT id, status, object_key, size_bytes FROM export_jobs WHERE id = ?')
    .bind(job.id)
    .first();
  if (['uploaded', 'emailing', 'emailed'].includes(accepted?.status)
    && accepted.object_key && Number.isFinite(accepted.size_bytes) && accepted.size_bytes > 0) {
    return verifiedUploadedResponse(accepted, env.EXPORTS_BUCKET);
  }
  return errorResponse('already_uploaded', 'This export is no longer pending', 409);
}

function uploadedResponse(job) {
  return json({ jobId: job.id, sizeBytes: job.size_bytes, status: 'uploaded' });
}

async function verifiedUploadedResponse(job, bucket) {
  const stored = await bucket.head(job.object_key);
  if (!stored || stored.size !== job.size_bytes) {
    return errorResponse('object_missing', 'The uploaded video is no longer available', 410);
  }
  return uploadedResponse(job);
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
