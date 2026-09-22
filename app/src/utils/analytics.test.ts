import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/analytics', () => ({
  GA4_DEBUG_MODE: false,
  GA4_MEASUREMENT_ID: 'G-TEST',
  shouldEnableAnalytics: () => true,
}));

describe('analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    window.dataLayer = [];
    window.gtag = undefined;
    window.__TRAILREPLAY_ANALYTICS_ENABLED__ = undefined;
  });

  it('disables automatic pageviews and sends one contextual manual pageview', async () => {
    const { initAnalytics } = await import('./analytics');

    initAnalytics({ page_type: 'tutorial', page_group: 'help' });
    document.dispatchEvent(new Event('DOMContentLoaded'));
    initAnalytics({ page_type: 'tutorial', page_group: 'help' });

    const queuedCalls = window.dataLayer as IArguments[];
    const configCalls = queuedCalls.filter((call) => call[0] === 'config');
    const pageViewCalls = queuedCalls.filter((call) => call[0] === 'event' && call[1] === 'page_view');

    expect(configCalls).toHaveLength(1);
    expect(configCalls[0]?.[2]).toMatchObject({ send_page_view: false });
    expect(pageViewCalls).toHaveLength(1);
    expect(pageViewCalls[0]?.[2]).toMatchObject({
      page_type: 'tutorial',
      page_group: 'help',
      app_name: 'TrailReplay',
    });
    expect(pageViewCalls[0]?.[2]).not.toHaveProperty('timestamp');
  });

  it('buffers early events after the pageview with ordered contextual parameters', async () => {
    const { initAnalytics, trackEvent } = await import('./analytics');
    trackEvent('early_action');
    initAnalytics({ page_type: 'tutorial', page_group: 'help' });
    document.dispatchEvent(new Event('DOMContentLoaded'));
    trackEvent('later_action');
    const events = (window.dataLayer as IArguments[]).filter((call) => call[0] === 'event');
    expect(events.map((call) => call[1])).toEqual(['page_view', 'early_action', 'later_action']);
    expect(events[1][2]).toMatchObject({ page_type: 'tutorial', analytics_version: 3, event_sequence: 1 });
    expect(events[2][2]).toMatchObject({ event_sequence: 2 });
  });

  it('strips app query data and fragments while retaining campaign attribution', async () => {
    const { safeAnalyticsUrl } = await import('./analytics');
    expect(safeAnalyticsUrl('https://trailreplay.com/?token=secret&utm_source=newsletter&email=private#location'))
      .toBe('https://trailreplay.com/?utm_source=newsletter');
  });

  it('caps parameter counts while preserving operation and common context', async () => {
    const { initAnalytics, trackEvent } = await import('./analytics');
    initAnalytics();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    trackEvent('large_event', { operation_id: 'attempt', ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field_${i}`, i])) });
    const call = (window.dataLayer as IArguments[]).at(-1)!;
    expect(Object.keys(call[2])).toHaveLength(25);
    expect(call[2]).toMatchObject({ app_name: 'TrailReplay', operation_id: 'attempt', analytics_version: 3 });
  });

  it('sanitizes event parameters and omits unsupported values', async () => {
    const { sanitizeAnalyticsParams } = await import('./analytics');

    expect(sanitizeAnalyticsParams({
      text: 'x'.repeat(120),
      count: 2.345,
      enabled: true,
      missing: null,
      nested: { unsafe: true },
    })).toEqual({
      text: 'x'.repeat(100),
      count: 2.35,
      enabled: true,
    });
  });

  it('creates stable low-cardinality reporting buckets', async () => {
    const {
      getBlobSizeBucket,
      getDistanceBucket,
      getDurationBucket,
      getProgressBucket,
    } = await import('./analytics');

    expect(getDistanceBucket(9_999)).toBe('short');
    expect(getDistanceBucket(42_000)).toBe('long');
    expect(getDurationBucket(90)).toBe('medium');
    expect(getBlobSizeBucket(250 * 1024 * 1024)).toBe('xlarge');
    expect(getProgressBucket(75)).toBe('75_100');
  });

  it('normalizes video export settings and milliseconds for reporting', async () => {
    const { getVideoExportAnalyticsParams } = await import('./analytics');

    expect(getVideoExportAnalyticsParams({
      format: 'mp4',
      quality: 'ultra',
      qualityMode: 'studio',
      fps: 60,
      resolution: { width: 2160, height: 3840 },
      aspectRatio: '9:16',
      includeAudio: false,
    }, 'webm', 90_000)).toEqual({
      export_format: 'webm',
      export_requested_format: 'mp4',
      export_quality: 'ultra',
      export_quality_mode: 'studio',
      export_fps: 60,
      export_aspect_ratio: '9:16',
      export_resolution: '2160x3840',
      export_width: 2160,
      export_height: 3840,
      export_duration_seconds: 90,
      export_duration_bucket: 'medium',
    });
  });

  it('reports the camera setting actually used, including defaults', async () => {
    const { getCameraUsageAnalyticsParams } = await import('./analytics');
    const camera = {
      mode: 'follow-behind' as const, zoom: 14, pitch: 55, bearing: 0,
      followBehindPreset: 'medium' as const, followBehindZoomLevel: 50,
      cameraStability: 0.5,
    };
    expect(getCameraUsageAnalyticsParams(camera)).toEqual({
      camera_stability_bucket: 'balanced', camera_zoom_bucket: 'medium_close',
    });
    expect(getCameraUsageAnalyticsParams({ ...camera, cameraStability: 0, followBehindZoomLevel: 0 })).toEqual({
      camera_stability_bucket: 'stable', camera_zoom_bucket: 'far',
    });
    expect(getCameraUsageAnalyticsParams({ ...camera, mode: 'overview' })).toEqual({
      camera_stability_bucket: 'not_applicable', camera_zoom_bucket: 'not_applicable',
    });
  });
});
