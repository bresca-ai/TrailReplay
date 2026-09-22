import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getCameraUsageAnalyticsParams, getProgressBucket, trackEvent } from '@/utils/analytics';

/** How playback was started, for analytics. */
export type PlaybackSource = 'play_button' | 'keyboard_shortcut' | 'restart_button';

/**
 * Start or stop playback, with the reporting that goes with it.
 *
 * Shared so the play button and the space-bar shortcut cannot drift apart:
 * they are the same action, and the only thing that differs is what gets
 * recorded as having triggered it.
 */
export function usePlaybackToggle() {
  const isPlaying = useAppStore((state) => state.playback.isPlaying);
  const progress = useAppStore((state) => state.playback.progress);
  const play = useAppStore((state) => state.play);
  const pause = useAppStore((state) => state.pause);
  const tracks = useAppStore((state) => state.tracks);
  const pictures = useAppStore((state) => state.pictures);
  const textAnnotations = useAppStore((state) => state.textAnnotations);
  const cameraSettings = useAppStore((state) => state.cameraSettings);
  const mapStyle = useAppStore((state) => state.settings.mapStyle);
  const show3DTerrain = useAppStore((state) => state.settings.show3DTerrain);
  const visibleStats = useAppStore((state) => state.settings.visibleStats);

  return useCallback((source: PlaybackSource) => {
    if (isPlaying) {
      pause();
      trackEvent('playback_paused', {
        playback_progress_bucket: getProgressBucket(progress * 100),
      });
      return;
    }

    play();
    trackEvent('playback_started', {
      playback_source: source,
      has_pictures: pictures.length > 0,
      has_annotations: textAnnotations.length > 0,
      track_count: tracks.length,
      camera_mode: cameraSettings.mode,
      ...getCameraUsageAnalyticsParams(cameraSettings),
      camera_preset: cameraSettings.mode === 'follow-behind' ? cameraSettings.followBehindPreset : 'not_applicable',
      map_style: mapStyle,
      terrain_3d_enabled: show3DTerrain,
    });
    trackEvent('feature_used', {
      feature_name: 'camera_mode',
      feature_value: cameraSettings.mode,
      feature_context: 'playback',
    });
    if (cameraSettings.mode === 'follow-behind') {
      trackEvent('feature_used', {
        feature_name: 'follow_behind_distance',
        feature_value: cameraSettings.followBehindPreset,
        feature_context: 'playback',
      });
    }
    visibleStats.forEach((statistic) => {
      trackEvent('feature_used', {
        feature_name: 'statistic',
        feature_value: statistic,
        feature_context: 'playback',
      });
    });
  }, [
    cameraSettings,
    isPlaying,
    mapStyle,
    pause,
    pictures.length,
    play,
    progress,
    show3DTerrain,
    textAnnotations.length,
    tracks.length,
    visibleStats,
  ]);
}
