import { useEffect, useRef } from 'react';
import type * as maplibregl from 'maplibre-gl';
import {
  getIntroCameraPose,
  getOpeningPreloadProgresses,
  getPlaybackCameraPose,
  type ReplayCameraMode,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';

// Never hold the replay behind the preparation screen indefinitely. The opening
// sequence gets the whole budget; each camera sample may finish sooner on idle.
const PRELOAD_TIMEOUT_MS = 6000;
const OPENING_WINDOW_MS = 12000;
const OPENING_SAMPLE_COUNT = 5;

type AnimationPhase = 'idle' | 'preloading' | 'intro' | 'playing' | 'outro' | 'ended';

interface UseTilePreloadParams {
  allCoordinates: number[][];
  animationPhase: AnimationPhase;
  cameraMode: ReplayCameraMode | 'cinematic';
  elevationData: Array<{ elevation: number; progress?: number }>;
  followBehindZoomLevel: number;
  isMapLoaded: boolean;
  isPlaying: boolean;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  setAnimationPhase: (phase: AnimationPhase) => void;
  smoothBearingRef: React.MutableRefObject<number>;
  targetBearingRef: React.MutableRefObject<number>;
  totalDurationMs: number;
}

function uniquePoses(poses: Array<ReplayCameraPose | null>): ReplayCameraPose[] {
  const seen = new Set<string>();
  return poses.filter((pose): pose is ReplayCameraPose => {
    if (!pose) return false;
    const key = [
      pose.center[0].toFixed(5),
      pose.center[1].toFixed(5),
      pose.zoom.toFixed(2),
      pose.pitch.toFixed(2),
      pose.bearing.toFixed(1),
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Warms the exact intro pose and a short sequence of future playback poses.
 * The map remains covered while it visits each viewport, so MapLibre retains
 * decoded tiles in its primary-map cache instead of only warming the browser's
 * HTTP cache. Playback then begins with both the opening shot and the first
 * twelve seconds of its camera path ready or already in flight.
 */
export function useTilePreload({
  allCoordinates,
  animationPhase,
  cameraMode,
  elevationData,
  followBehindZoomLevel,
  isMapLoaded,
  isPlaying,
  mapRef,
  setAnimationPhase,
  smoothBearingRef,
  targetBearingRef,
  totalDurationMs,
}: UseTilePreloadParams) {
  const hasAdvancedRef = useRef(false);

  useEffect(() => {
    if (animationPhase !== 'preloading') {
      hasAdvancedRef.current = false;
      return;
    }

    if (!isPlaying) {
      setAnimationPhase('idle');
      return;
    }

    const map = mapRef.current;
    if (!map || !isMapLoaded || allCoordinates.length === 0 || cameraMode === 'overview') {
      setAnimationPhase('intro');
      return;
    }

    hasAdvancedRef.current = false;
    let cancelled = false;
    let activeTimeout: ReturnType<typeof setTimeout> | null = null;
    const overview = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
    // Tile prefetch has no cinematic-specific pose logic yet — approximate
    // with follow-behind, which sits at a similar zoom/pitch, rather than
    // skipping prefetch for the mode entirely.
    const poseCameraMode = cameraMode === 'cinematic' ? 'follow-behind' : cameraMode;
    const introPose = getIntroCameraPose({
      cameraMode: poseCameraMode,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      progress: 0,
    });
    const openingPoses = getOpeningPreloadProgresses(
      totalDurationMs || 60000,
      OPENING_WINDOW_MS,
      OPENING_SAMPLE_COUNT,
    ).map((progress) => getPlaybackCameraPose({
      cameraMode: poseCameraMode,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      progress,
    }));
    const poses = uniquePoses([introPose, ...openingPoses]);
    const deadline = Date.now() + PRELOAD_TIMEOUT_MS;

    const restoreAndAdvance = () => {
      if (hasAdvancedRef.current || cancelled) return;
      hasAdvancedRef.current = true;
      if (activeTimeout) clearTimeout(activeTimeout);
      map.jumpTo(overview);
      if (introPose) {
        smoothBearingRef.current = introPose.bearing;
        targetBearingRef.current = introPose.bearing;
      }
      setAnimationPhase('intro');
    };

    const warmPose = (pose: ReplayCameraPose) => new Promise<void>((resolve) => {
      const finish = () => {
        map.off('idle', finish);
        if (activeTimeout) {
          clearTimeout(activeTimeout);
          activeTimeout = null;
        }
        resolve();
      };

      map.jumpTo(pose);
      map.once('idle', finish);
      activeTimeout = setTimeout(finish, Math.max(0, deadline - Date.now()));
    });

    void (async () => {
      for (const pose of poses) {
        if (cancelled || Date.now() >= deadline) break;
        await warmPose(pose);
      }
      restoreAndAdvance();
    })();

    return () => {
      cancelled = true;
      if (activeTimeout) clearTimeout(activeTimeout);
      if (!hasAdvancedRef.current) map.jumpTo(overview);
    };
  }, [
    allCoordinates,
    animationPhase,
    cameraMode,
    elevationData,
    followBehindZoomLevel,
    isMapLoaded,
    isPlaying,
    mapRef,
    setAnimationPhase,
    smoothBearingRef,
    targetBearingRef,
    totalDurationMs,
  ]);
}
