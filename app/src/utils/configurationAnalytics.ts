import type { AppSettings, CameraSettings, SocialShareSettings, StatId, VideoExportSettings, VideoFormat } from '@/types';
import { trackEvent } from '@/utils/analytics';

type UsageContext = 'playback' | 'video_export';

export interface UsageConfiguration {
  settings: AppSettings;
  cameraSettings: CameraSettings;
  textAnnotations: readonly unknown[];
  pictures: readonly unknown[];
  videos: readonly unknown[];
  videoExportSettings?: VideoExportSettings;
}

const STATISTICS: readonly StatId[] = [
  'distance', 'duration', 'movingDuration', 'pace', 'elevation',
  'heartRate', 'speed', 'altitude',
];

const stateOf = (enabled: boolean) => enabled ? 'enabled' : 'disabled';
const bucketCount = (count: number) => count === 0 ? 'none' : count === 1 ? 'one' : count <= 3 ? 'two_three' : 'four_plus';

/** Low-cardinality values for settings actually used, including untouched defaults. */
export function getCameraUsageAnalyticsParams(camera: CameraSettings) {
  const stability = Math.max(0, Math.min(1, camera.cameraStability));
  const zoom = Math.max(0, Math.min(100, camera.followBehindZoomLevel));
  return {
    camera_stability_bucket: camera.mode === 'overview' ? 'not_applicable'
      : stability < 0.35 ? 'stable' : stability > 0.65 ? 'reactive' : 'balanced',
    // The user's follow-behind distance control, not the map's changing zoom.
    camera_zoom_bucket: camera.mode === 'follow-behind'
      ? zoom < 25 ? 'far' : zoom < 50 ? 'medium_far' : zoom < 75 ? 'medium_close' : 'close'
      : 'not_applicable',
  };
}

/** Every option has one value per use; disabled/default choices are not invisible. */
export function getConfigurationUsage(configuration: UsageConfiguration): Array<readonly [string, string]> {
  const { settings, cameraSettings, textAnnotations, pictures, videos } = configuration;
  const { trailStyle, mapOverlays } = settings;
  const { camera_stability_bucket, camera_zoom_bucket } = getCameraUsageAnalyticsParams(cameraSettings);
  return [
    ['camera_mode', cameraSettings.mode],
    ['camera_stability', camera_stability_bucket],
    ['camera_distance', camera_zoom_bucket],
    ['camera_preset', cameraSettings.mode === 'follow-behind' ? cameraSettings.followBehindPreset : 'not_applicable'],
    ['map_style', settings.mapStyle],
    ['map_filter', settings.mapFilter],
    ['terrain_3d', stateOf(settings.show3DTerrain)],
    ['annotations', bucketCount(textAnnotations.length)],
    ['pictures', bucketCount(pictures.length)],
    ['videos', bucketCount(videos.length)],
    ['show_pictures', stateOf(settings.showPictures)],
    ['elevation_profile', stateOf(settings.showElevationProfile)],
    ['marker', stateOf(trailStyle.showMarker)],
    ['marker_type', trailStyle.markerType],
    ['track_labels', stateOf(trailStyle.showTrackLabels)],
    ['trail_color_mode', trailStyle.colorMode],
    ['ghost_trail', stateOf(trailStyle.ghostTrailOpacity > 0)],
    ['stats_background', settings.statsBackground],
    ['stats_layout', settings.statsLayout],
    ['pace_mode', settings.paceMode],
    ['journey_stats_mode', settings.journeyStatsMode],
    ...(['skiPistes', 'slopeOverlay', 'placeLabels', 'aspectOverlay'] as const).map(
      (overlay) => [`map_overlay_${overlay}`, stateOf(Boolean(mapOverlays?.[overlay]))] as const,
    ),
    ...STATISTICS.map((statistic) => [
      `stat_${statistic}`, stateOf(settings.visibleStats.includes(statistic)),
    ] as const),
  ];
}

/** Report one bounded option/value pair per replay use, not per slider movement. */
export function trackConfigurationUsage(context: UsageContext, configuration: UsageConfiguration, actualFormat?: VideoFormat) {
  const options = getConfigurationUsage(configuration);
  if (context === 'video_export' && configuration.videoExportSettings) {
    const video = configuration.videoExportSettings;
    options.push(
      ['export_format', actualFormat ?? video.format],
      ['export_requested_format', video.format],
      ['export_quality', video.quality],
      ['export_quality_mode', video.qualityMode],
      ['export_fps', [24, 25, 30, 50, 60].includes(video.fps) ? String(video.fps) : 'other'],
      ['export_aspect_ratio', video.aspectRatio],
      ['export_resolution', `${video.resolution.width}x${video.resolution.height}`],
      ['export_audio', stateOf(video.includeAudio)],
    );
  }
  options.forEach(([feature_name, feature_value]) => {
    trackEvent('feature_used', { feature_name, feature_value, feature_context: context });
  });
}

/** Poster options describe the successful output, without sending custom text or image IDs. */
export function trackSocialExportConfiguration(settings: SocialShareSettings) {
  const options: Array<readonly [string, string]> = [
    ['social_template', settings.template],
    ['social_aspect_ratio', settings.aspectRatio],
    ['social_title_mode', settings.titleMode],
    ['social_photo', stateOf(settings.selectedPictureId !== null)],
    ['social_location', stateOf(settings.showLocation)],
    ['social_stats', stateOf(settings.showStats)],
    ['social_elevation_chart', stateOf(settings.showElevationMiniChart)],
    ['social_route_glow', stateOf(settings.routeGlow)],
  ];
  options.forEach(([feature_name, feature_value]) => {
    trackEvent('feature_used', { feature_name, feature_value, feature_context: 'social_export' });
  });
}
