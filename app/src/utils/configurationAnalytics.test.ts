import { describe, expect, it, vi } from 'vitest';
import { createDefaultCameraSettings, createDefaultSettings, createDefaultVideoExportSettings } from '@/store/defaults';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('@/utils/analytics', () => ({ trackEvent }));

import {
  getCameraUsageAnalyticsParams,
  getConfigurationUsage,
  trackConfigurationUsage,
  trackSocialExportConfiguration,
} from './configurationAnalytics';

const configuration = () => ({
  settings: createDefaultSettings(),
  cameraSettings: createDefaultCameraSettings(),
  textAnnotations: [] as unknown[],
  pictures: [] as unknown[],
  videos: [] as unknown[],
});

describe('configuration usage analytics', () => {
  it('distinguishes stable, balanced and reactive from the setting actually used', () => {
    const camera = createDefaultCameraSettings();
    expect(getCameraUsageAnalyticsParams(camera).camera_stability_bucket).toBe('balanced');
    expect(getCameraUsageAnalyticsParams({ ...camera, cameraStability: 0 }).camera_stability_bucket).toBe('stable');
    expect(getCameraUsageAnalyticsParams({ ...camera, cameraStability: 1 }).camera_stability_bucket).toBe('reactive');
    expect(getCameraUsageAnalyticsParams({ ...camera, followBehindZoomLevel: 0 }).camera_zoom_bucket).toBe('far');
    expect(getCameraUsageAnalyticsParams({ ...camera, mode: 'overview' })).toEqual({
      camera_stability_bucket: 'not_applicable', camera_zoom_bucket: 'not_applicable',
    });
  });

  it('reports both used defaults and disabled options with bounded values', () => {
    const usage = new Map(getConfigurationUsage(configuration()));
    expect(usage.get('camera_mode')).toBe('follow-behind');
    expect(usage.get('camera_stability')).toBe('balanced');
    expect(usage.get('annotations')).toBe('none');
    expect(usage.get('terrain_3d')).toBe('enabled');
    expect(usage.get('track_labels')).toBe('disabled');
    expect(usage.get('stat_distance')).toBe('enabled');
    expect(usage.get('stat_heartRate')).toBe('disabled');
    expect(usage.size).toBe(getConfigurationUsage(configuration()).length);
  });

  it('records a distinct usage context and never sends user content', () => {
    trackEvent.mockClear();
    const snapshot = configuration();
    snapshot.textAnnotations.push({ text: 'Private summit note' });
    trackConfigurationUsage('video_export', snapshot);
    expect(trackEvent).toHaveBeenCalledWith('feature_used', {
      feature_name: 'annotations', feature_value: 'one', feature_context: 'video_export',
    });
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain('Private summit note');
  });

  it('reports actual video output choices as option usage', () => {
    trackEvent.mockClear();
    trackConfigurationUsage('video_export', {
      ...configuration(), videoExportSettings: createDefaultVideoExportSettings(),
    }, 'webm');
    expect(trackEvent).toHaveBeenCalledWith('feature_used', {
      feature_name: 'export_format', feature_value: 'webm', feature_context: 'video_export',
    });
    expect(trackEvent).toHaveBeenCalledWith('feature_used', {
      feature_name: 'export_audio', feature_value: 'disabled', feature_context: 'video_export',
    });
  });

  it('reports social-export options without custom text or photo identifiers', async () => {
    const { createDefaultSocialShareSettings } = await import('@/store/defaults');
    trackEvent.mockClear();
    trackSocialExportConfiguration({
      ...createDefaultSocialShareSettings(), customTitle: 'Private trip',
      selectedPictureId: 'private-photo-id', showStats: false,
    });
    expect(trackEvent).toHaveBeenCalledWith('feature_used', {
      feature_name: 'social_stats', feature_value: 'disabled', feature_context: 'social_export',
    });
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain('Private trip');
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain('private-photo-id');
  });
});
