import { describe, expect, it, vi } from 'vitest';
import {
  MAX_STUDIO_DELIVERY_BYTES,
  StudioDeliveryError,
  createStudioDeliveryJob,
  deliverStudioExport,
  isValidDeliveryEmail,
  shouldAutoDownloadVideo,
  type StudioDeliveryJob,
} from './studioDelivery';

const job: StudioDeliveryJob = {
  jobId: 'job-1',
  jobToken: 'secret-token',
  uploadUrl: '/api/exports/job-1/upload',
  completeUrl: '/api/exports/job-1/complete',
  expiresAt: '2026-09-14T00:00:00.000Z',
};

describe('isValidDeliveryEmail', () => {
  it('accepts plausible addresses and rejects malformed ones', () => {
    expect(isValidDeliveryEmail('alex+studio@example.com')).toBe(true);
    expect(isValidDeliveryEmail('not-an-email')).toBe(false);
    expect(isValidDeliveryEmail('a@b')).toBe(false);
  });
});

describe('shouldAutoDownloadVideo', () => {
  it('downloads standard exports but leaves Studio exports to email delivery', () => {
    expect(shouldAutoDownloadVideo('standard')).toBe(true);
    expect(shouldAutoDownloadVideo('studio')).toBe(false);
    expect(shouldAutoDownloadVideo('studio', true)).toBe(true);
  });
});

describe('createStudioDeliveryJob', () => {
  it('registers the email, consent and render settings', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json(job, { status: 201 }));

    await expect(createStudioDeliveryJob({
      email: '  Alex@Example.com ',
      marketingConsent: true,
      locale: 'en',
      settings: {
        quality: 'high',
        qualityMode: 'studio',
        aspectRatio: '16:9',
        fps: 30,
        durationMs: 60_000,
      },
    }, fetchImplementation)).resolves.toEqual(job);

    expect(fetchImplementation).toHaveBeenCalledWith('/api/exports', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        email: 'Alex@Example.com',
        marketingConsent: true,
        locale: 'en',
        settings: {
          quality: 'high',
          qualityMode: 'studio',
          aspectRatio: '16:9',
          fps: 30,
          durationMs: 60_000,
        },
      }),
    }));
  });

  it('rejects malformed success payloads', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json({ jobId: 'job-1' }, { status: 201 }));
    await expect(createStudioDeliveryJob({
      email: 'alex@example.com',
      marketingConsent: false,
      locale: 'en',
      settings: { quality: 'high', qualityMode: 'studio', aspectRatio: '16:9', fps: 30, durationMs: 1000 },
    }, fetchImplementation)).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('deliverStudioExport', () => {
  it('uploads the MP4 before requesting delivery', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: 'uploaded' }))
      .mockResolvedValueOnce(Response.json({ status: 'emailed', provider: 'cloudflare' }));
    const phases: string[] = [];
    const blob = new Blob(['video'], { type: 'video/mp4' });

    await expect(deliverStudioExport(
      job,
      blob,
      (phase) => phases.push(phase),
      fetchImplementation,
    )).resolves.toEqual({ provider: 'cloudflare' });

    expect(phases).toEqual(['uploading', 'emailing']);
    expect(fetchImplementation).toHaveBeenNthCalledWith(1, job.uploadUrl, expect.objectContaining({
      method: 'PUT',
      body: blob,
    }));
    expect(fetchImplementation).toHaveBeenNthCalledWith(2, job.completeUrl, expect.objectContaining({
      method: 'POST',
    }));
  });

  it('surfaces server errors and never emails after a failed upload', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json(
      { error: 'too_large', message: 'Video is too large' },
      { status: 413 },
    ));

    await expect(deliverStudioExport(
      job,
      new Blob(['video']),
      () => undefined,
      fetchImplementation,
    )).rejects.toEqual(new StudioDeliveryError('too_large', 'Video is too large'));
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized files before making a request', async () => {
    const fetchImplementation = vi.fn();
    const oversized = { size: MAX_STUDIO_DELIVERY_BYTES + 1 } as Blob;

    await expect(deliverStudioExport(job, oversized, () => undefined, fetchImplementation))
      .rejects.toMatchObject({ code: 'video_too_large' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
