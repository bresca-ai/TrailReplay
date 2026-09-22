// POST /api/exports/:jobId/complete — email the finished video.
//
// Split from the upload so a known pre-acceptance email rejection can be
// retried without re-uploading the video. An uncertain provider outcome must
// instead be reconciled before another send.

import {
  EXPORT_LINK_TTL_DAYS,
  errorResponse,
  getPublicOrigin,
  json,
  methodNotAllowed,
  nowIso,
  requireLeadsDb,
} from '../../../../functions-lib/http.js';
import { createToken, hashToken, verifyToken } from '../../../../functions-lib/tokens.js';
import { sendEmail } from '../../../../functions-lib/email.js';
import { renderExportReadyEmail } from '../../../../functions-lib/emailTemplates.js';

const DELIVERY_UNKNOWN_MESSAGE = 'Email delivery could not be confirmed. Your video is saved and can still be downloaded. Contact support before trying to send it again.';

export async function onRequest({ request, env, params }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const notConfigured = requireLeadsDb(env);
  if (notConfigured) return notConfigured;
  if (!env.EXPORTS_BUCKET) {
    return errorResponse('not_configured', 'Video storage is not configured', 503);
  }

  const job = await env.LEADS_DB
    .prepare('SELECT id, email, status, job_token_hash, object_key, expires_at FROM export_jobs WHERE id = ?')
    .bind(params.jobId)
    .first();

  const token = bearerToken(request);
  if (!job || !(await verifyToken(token, job.job_token_hash))) {
    return errorResponse('not_found', 'Unknown export job', 404);
  }
  if (Date.parse(job.expires_at) < Date.now()) {
    return errorResponse('expired', 'This export expired before delivery', 410);
  }

  // Idempotent: a retry after a response was lost in flight must not send the
  // video twice.
  if (job.status === 'emailed') {
    return json({ jobId: job.id, status: 'emailed', alreadySent: true });
  }
  if (job.status === 'emailing') {
    // A worker may have died after claiming the job. There is no provider-side
    // deduplication on the Cloudflare path, so an old claim needs reconciliation
    // rather than a timer that blindly submits the email again.
    return errorResponse('delivery_in_progress', 'Email delivery is in progress or needs review. Your video is saved and can still be downloaded.', 409);
  }
  if (job.status === 'delivery_unknown') {
    return errorResponse('delivery_unknown', DELIVERY_UNKNOWN_MESSAGE, 409);
  }
  if (job.status !== 'uploaded') {
    return errorResponse('not_uploaded', 'Upload the video before completing the job', 409);
  }

  // Guards against a row that says `uploaded` while the object is gone —
  // expired by lifecycle rule, or deleted by hand.
  if (job.object_key) {
    const stored = await env.EXPORTS_BUCKET.head(job.object_key);
    if (!stored) {
      await markFailed(env.LEADS_DB, job.id, 'object_missing');
      return errorResponse('object_missing', 'The uploaded video is no longer available', 410);
    }
  } else {
    return errorResponse('not_uploaded', 'Upload the video before completing the job', 409);
  }

  const lead = await env.LEADS_DB
    .prepare('SELECT marketing_opted_in_at, marketing_confirmed_at, marketing_unsubscribed_at FROM leads WHERE email = ?')
    .bind(job.email)
    .first();

  // Confirmation is only worth asking for from someone who opted in and has
  // not already confirmed or unsubscribed.
  const needsConfirmation = Boolean(lead?.marketing_opted_in_at)
    && !lead?.marketing_confirmed_at
    && !lead?.marketing_unsubscribed_at;

  const origin = getPublicOrigin(request, env);
  // Minted here, in the same request that embeds them in links: only hashes are
  // ever stored, so the plaintext cannot be recovered later.
  const confirmToken = needsConfirmation ? createToken() : null;
  const unsubscribeToken = lead?.marketing_opted_in_at ? createToken() : null;

  const message = renderExportReadyEmail({
    downloadUrl: `${origin}/api/download/${job.id}?t=${encodeURIComponent(token)}`,
    expiryDays: EXPORT_LINK_TTL_DAYS,
    confirmUrl: confirmToken ? `${origin}/api/subscribe/confirm?t=${encodeURIComponent(confirmToken)}` : null,
    unsubscribeUrl: unsubscribeToken ? `${origin}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken)}` : null,
  });

  // Claim the delivery before calling the provider. This prevents two browser
  // retries arriving together from sending the same message twice.
  const claim = await env.LEADS_DB
    .prepare("UPDATE export_jobs SET status = 'emailing', error = NULL WHERE id = ? AND status = 'uploaded'")
    .bind(job.id)
    .run();
  if (!claim.success || claim.meta?.changes !== 1) {
    return errorResponse('delivery_in_progress', 'Email delivery is already in progress', 409);
  }

  let providerSubmissionStarted = false;
  let providerAccepted = false;
  try {
    const tokenUpdates = [];
    if (confirmToken) {
      tokenUpdates.push(env.LEADS_DB
        .prepare('UPDATE leads SET confirm_token_hash = ? WHERE email = ?')
        .bind(await hashToken(confirmToken), job.email));
    }
    if (unsubscribeToken) {
      tokenUpdates.push(env.LEADS_DB
        .prepare('UPDATE leads SET unsubscribe_token_hash = ? WHERE email = ?')
        .bind(await hashToken(unsubscribeToken), job.email));
    }
    if (tokenUpdates.length > 0) {
      const updates = await env.LEADS_DB.batch(tokenUpdates);
      if (updates.some((update) => !update.success)) {
        throw new Error('Could not save the email action links');
      }
    }

    providerSubmissionStarted = true;
    const result = await sendEmail(env, { to: job.email, ...message });
    providerAccepted = true;
    const completed = await env.LEADS_DB
      .prepare("UPDATE export_jobs SET status = 'emailed', completed_at = ?, error = NULL WHERE id = ? AND status = 'emailing'")
      .bind(nowIso(), job.id)
      .run();
    if (!completed.success || completed.meta?.changes !== 1) {
      throw new Error('Could not confirm the email delivery state');
    }
    return json({ jobId: job.id, status: 'emailed', provider: result.provider });
  } catch (error) {
    // Only a failure before submission or an explicit provider rejection may
    // return to `uploaded`. A lost response or failed D1 write after acceptance
    // has an unknown outcome; retrying it could send a second email and rotate
    // the confirmation/unsubscribe hashes out from under the first message.
    const safeToRetry = !providerAccepted
      && (!providerSubmissionStarted || error?.safeToRetry === true);
    const nextStatus = safeToRetry ? 'uploaded' : 'delivery_unknown';
    let stateUpdated = false;
    try {
      const update = await env.LEADS_DB
        .prepare(`UPDATE export_jobs SET status = '${nextStatus}', error = ? WHERE id = ? AND status = 'emailing'`)
        .bind(String(error?.message ?? error).slice(0, 500), job.id)
        .run();
      stateUpdated = update.success && update.meta?.changes === 1;
    } catch {
      // The row remains `emailing` if D1 is unavailable. That state also blocks
      // automatic resend and is explicitly reported as needing review above.
    }
    return safeToRetry && stateUpdated
      ? errorResponse('email_failed', 'The video was saved but the email could not be sent', 502)
      : errorResponse('delivery_unknown', DELIVERY_UNKNOWN_MESSAGE, 503);
  }
}

async function markFailed(db, jobId, reason) {
  await db
    .prepare("UPDATE export_jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?")
    .bind(reason, nowIso(), jobId)
    .run();
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
