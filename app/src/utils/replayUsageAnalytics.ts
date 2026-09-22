import type { AppState } from '@/store/storeTypes';
import { getCameraUsageAnalyticsParams, trackEvent } from './analytics';
import { getAvailableStats } from './statAvailability';

type Emit = typeof trackEvent;
export type ReplayUsageContext = 'playback' | 'video_export';

/** Only settings used by the camera engine. Legacy camera.zoom/pitch/bearing
 * are deliberately excluded: they do not describe the rendered camera. */
export function cameraSettingsParams(state: AppState) {
  const camera = state.cameraSettings;
  const shots = state.cinematicCameraKeyframes;
  return {
    camera_mode: camera.mode,
    ...(camera.mode !== 'overview' ? { camera_stability_value: camera.cameraStability } : {}),
    ...(camera.mode === 'follow-behind' ? {
      camera_preset: camera.followBehindPreset,
      camera_distance_level: camera.followBehindZoomLevel,
    } : {}),
    ...(camera.mode === 'cinematic' ? {
      cinematic_keyframe_count: shots.length,
      ...(shots.length ? {
        cinematic_zoom_min: Math.min(...shots.map((shot) => shot.zoom)),
        cinematic_zoom_max: Math.max(...shots.map((shot) => shot.zoom)),
      } : {}),
    } : {}),
  };
}

/** One row per selected/included feature: reuses GA's registered feature_name,
 * feature_value and feature_context dimensions. Never sends authored content. */
export function reportReplayFeatures(state: AppState, context: ReplayUsageContext, emit: Emit) {
  const { settings, cameraSettings: camera } = state;
  const style = settings.trailStyle;
  const used = (name: string, value: string | number | boolean, count?: number) => emit('feature_used', {
    feature_name: name, feature_value: String(value), feature_context: context,
    feature_state: 'enabled', ...(count === undefined ? {} : { feature_count: count }),
  });
  used('camera_mode', camera.mode);
  if (camera.mode !== 'overview') used('camera_stability', camera.cameraStability);
  if (camera.mode === 'follow-behind') {
    used('follow_behind_distance', camera.followBehindPreset);
    used('follow_behind_distance_level', camera.followBehindZoomLevel);
  }
  if (camera.mode === 'cinematic' && state.cinematicCameraKeyframes.length) used('cinematic_shots', 'authored', state.cinematicCameraKeyframes.length);
  used('map_style', settings.mapStyle);
  used('map_filter', settings.mapFilter);
  if (settings.show3DTerrain) used('terrain_3d', true);
  for (const [overlay, enabled] of Object.entries(settings.mapOverlays)) if (enabled) used(`map_overlay_${overlay}`, true);
  used('trail_color_mode', style.colorMode);
  if (style.showMarker) {
    used('marker_type', style.markerType);
    used('marker_size', style.markerSize);
  }
  if (style.showTrackLabels) used('track_labels', true);
  if (style.showMarker && style.markerType === 'icon' && style.showCircle) used('marker_circle', true);
  used('route_timing', state.playback.routeTimingMode);
  if (context === 'playback') used('playback_speed', state.playback.speed);
  const stats = getAvailableStats(settings.visibleStats, state.tracks);
  stats.forEach((stat) => used('statistic', stat));
  if (stats.length) {
    used('stats_layout', settings.statsLayout);
    used('stats_background', settings.statsBackground);
    used('stats_scale', settings.statsScale);
    used('journey_stats_mode', settings.journeyStatsMode);
    if (stats.includes('pace')) used('pace_mode', settings.paceMode);
  }
  if (settings.showElevationProfile) used('elevation_profile', true);
  const pictures = state.pictures.filter((item) => !item.isPlaceholder).length;
  if (settings.showPictures && pictures) used('photos', 'included', pictures);
  const videos = state.videos.filter((item) => !item.isPlaceholder).length;
  if (videos) used('videos', 'included', videos);
  for (const presentation of ['map-card', 'side-panel'] as const) {
    const count = state.textAnnotations.filter((item) => (item.presentation ?? 'map-card') === presentation).length;
    if (count) used('annotation_presentation', presentation, count);
  }
  const comparisons = state.comparisonTracks.filter((track) => track.visible).length;
  if (comparisons) used('comparison_tracks', 'visible', comparisons);
  for (const mode of new Set(state.journeySegments.flatMap((segment) => segment.type === 'transport' ? [segment.mode] : []))) used('transport', mode);
  if (state.showAutomaticLandmarks) used('route_moments', true);
  // Configuration, not a claim that a nearby-places request succeeded.
  if (state.nearbyPlacesEnabled) used('nearby_named_places', 'enabled');
  if (state.userLandmarks.length) used('authored_landmarks', 'included', state.userLandmarks.length);
}

export function createReplayUsageAnalytics(emit: Emit = trackEvent) {
  let run: { context: ReplayUsageContext; report: Emit; sampled: Set<number> } | null = null;
  return {
    start(state: AppState, context: ReplayUsageContext, operationEmit: Emit = emit) {
      const usageId = crypto.randomUUID();
      const report: Emit = (name, params = {}) => operationEmit(name, { ...params, feature_context: context, usage_id: usageId });
      run = { context, report, sampled: new Set() };
      report('camera_settings_used', cameraSettingsParams(state));
      reportReplayFeatures(state, context, report);
      report('replay_configuration', {
        track_count: state.tracks.length,
        photo_count: state.pictures.filter((item) => !item.isPlaceholder).length,
        video_count: state.videos.filter((item) => !item.isPlaceholder).length,
        annotation_count: state.textAnnotations.length,
        photos_enabled: state.settings.showPictures,
        terrain_3d_enabled: state.settings.show3DTerrain,
        elevation_enabled: state.settings.showElevationProfile,
        marker_enabled: state.settings.trailStyle.showMarker,
        route_moments_enabled: state.showAutomaticLandmarks,
        nearby_places_enabled: state.nearbyPlacesEnabled,
        statistic_count: getAvailableStats(state.settings.visibleStats, state.tracks).length,
        camera_mode: state.cameraSettings.mode,
      });
    },
    observe(state: AppState, previous: AppState) {
      if (!run || (run.context === 'video_export') !== state.isExporting) return;
      if ((state.animationPhase === 'idle' || state.animationPhase === 'ended') && state.animationPhase !== previous.animationPhase) { run = null; return; }
      if (state.animationPhase !== 'playing') return;
      if (state.cameraSettings !== previous.cameraSettings) {
        run.report('camera_settings_used', { ...cameraSettingsParams(state), snapshot_reason: 'changed_during_replay' });
      }
      // CameraPosition is published after the camera applies its pose. Do not
      // sample a stale pose when only the timeline advances. No coordinates.
      if (!state.cameraPosition || state.cameraPosition === previous.cameraPosition) return;
      if (!state.playback.isPlaying && state.playback.progress < 1) return;
      const bucket = Math.min(4, Math.max(0, Math.floor(state.playback.progress * 4)));
      if (run.sampled.has(bucket)) return;
      const { zoom, pitch, bearing } = state.cameraPosition;
      if (![zoom, pitch, bearing].every(Number.isFinite)) return;
      run.sampled.add(bucket);
      run.report('camera_view_sampled', {
        camera_mode: state.cameraSettings.mode,
        camera_zoom_level: zoom, camera_pitch_deg: pitch, camera_bearing_deg: bearing,
        sample_progress_percent: state.playback.progress * 100,
        sample_quarter: bucket,
      });
    },
    stop() { run = null; },
  };
}

export const replayUsageAnalytics = createReplayUsageAnalytics();

/** Shared by the play button, keyboard shortcut and restart button. */
export function reportPlaybackStart(state: AppState, source: string) {
  trackEvent('playback_started', {
    playback_source: source,
    has_pictures: state.pictures.length > 0,
    has_annotations: state.textAnnotations.length > 0,
    track_count: state.tracks.length,
    camera_mode: state.cameraSettings.mode,
    ...getCameraUsageAnalyticsParams(state.cameraSettings),
    camera_preset: state.cameraSettings.mode === 'follow-behind' ? state.cameraSettings.followBehindPreset : 'not_applicable',
    map_style: state.settings.mapStyle,
    terrain_3d_enabled: state.settings.show3DTerrain,
  });
  replayUsageAnalytics.start(state, 'playback');
}
