import type { VideoExportSettings, VideoQualityMode } from '@/types';

export const MAX_STUDIO_DELIVERY_BYTES = 95 * 1024 * 1024;
/** Local Vite has no Cloudflare D1/R2/email bindings. Keep Studio rendering usable there. */
export const localStudioDownload = import.meta.env.DEV;

export interface StudioDeliveryRequest {
  email: string;
  marketingConsent: boolean;
}

export interface StudioDeliveryJob {
  jobId: string;
  jobToken: string;
  uploadUrl: string;
  completeUrl: string;
  expiresAt: string;
}

interface CreateStudioDeliveryJobInput extends StudioDeliveryRequest {
  locale: string;
  settings: Pick<VideoExportSettings, 'quality' | 'qualityMode' | 'aspectRatio' | 'fps'> & {
    durationMs: number;
  };
}

type FetchImplementation = typeof fetch;

export class StudioDeliveryError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StudioDeliveryError';
    this.code = code;
  }
}

export function isValidDeliveryEmail(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0
    && normalized.length <= 254
    && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(normalized);
}

/**
 * Standard exports are saved to the device as soon as they finish. Studio
 * exports use email delivery instead, avoiding a second large-file transfer
 * to the user's device after the upload completes.
 */
export function shouldAutoDownloadVideo(qualityMode: VideoQualityMode, localDownload = false): boolean {
  return qualityMode === 'standard' || (qualityMode === 'studio' && localDownload);
}

export async function createStudioDeliveryJob(
  input: CreateStudioDeliveryJobInput,
  fetchImplementation: FetchImplementation = fetch,
): Promise<StudioDeliveryJob> {
  const response = await fetchImplementation('/api/exports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email.trim(),
      marketingConsent: input.marketingConsent,
      locale: input.locale,
      settings: input.settings,
    }),
  });
  const body = await readJson(response);
  if (!response.ok) throw responseError(body, response.status, 'register_failed');

  if (!isStudioDeliveryJob(body)) {
    throw new StudioDeliveryError('invalid_response', 'The delivery service returned an invalid response.');
  }
  return body;
}

export async function deliverStudioExport(
  job: StudioDeliveryJob,
  blob: Blob,
  onPhase: (phase: 'uploading' | 'emailing') => void,
  fetchImplementation: FetchImplementation = fetch,
): Promise<{ provider: string | null }> {
  if (blob.size <= 0) {
    throw new StudioDeliveryError('empty_video', 'The rendered video is empty.');
  }
  if (blob.size > MAX_STUDIO_DELIVERY_BYTES) {
    throw new StudioDeliveryError(
      'video_too_large',
      `The rendered video is larger than ${Math.floor(MAX_STUDIO_DELIVERY_BYTES / (1024 * 1024))} MB.`,
    );
  }

  onPhase('uploading');
  const uploadResponse = await fetchImplementation(job.uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${job.jobToken}`,
      'Content-Type': 'video/mp4',
    },
    body: blob,
  });
  const uploadBody = await readJson(uploadResponse);
  if (!uploadResponse.ok) throw responseError(uploadBody, uploadResponse.status, 'upload_failed');

  onPhase('emailing');
  const completeResponse = await fetchImplementation(job.completeUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${job.jobToken}` },
  });
  const completeBody = await readJson(completeResponse);
  if (!completeResponse.ok) throw responseError(completeBody, completeResponse.status, 'email_failed');

  return {
    provider: typeof completeBody?.provider === 'string' ? completeBody.provider : null,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function responseError(
  body: Record<string, unknown> | null,
  status: number,
  fallbackCode: string,
): StudioDeliveryError {
  const code = typeof body?.error === 'string' ? body.error : fallbackCode;
  const message = typeof body?.message === 'string'
    ? body.message
    : `The delivery service returned HTTP ${status}.`;
  return new StudioDeliveryError(code, message);
}

function isStudioDeliveryJob(value: unknown): value is StudioDeliveryJob {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['jobId', 'jobToken', 'uploadUrl', 'completeUrl', 'expiresAt']
    .every((key) => typeof record[key] === 'string' && record[key].length > 0)
    && (record.uploadUrl as string).startsWith('/api/exports/')
    && (record.completeUrl as string).startsWith('/api/exports/');
}
