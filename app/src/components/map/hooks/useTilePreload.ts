import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  type ReplayCameraMode,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';
import type { PreparedCinematicKeyframe } from '@/utils/cinematicCameraPlan';
import { toMapCameraOptions } from '@/utils/cameraTarget';
import {
  deduplicateCameraPoses,
  getDeterministicIntroStartPose,
  getOpeningReplayWarmupPoses,
  getReplayWarmupPose,
  getTransitionWarmupPoses,
} from '@/utils/replayCameraWarmupPlan';

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
  cinematicKeyframes?: PreparedCinematicKeyframe[];
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

/**
 * Warms the intro/outro camera paths and a short sequence of future playback poses.
 * The map remains covered while it visits each viewport, so MapLibre retains
 * decoded tiles in its primary-map cache instead of only warming the browser's
 * HTTP cache. Playback then begins with both the opening shot and the first
 * twelve seconds of its camera path ready or already in flight.
 */
export function useTilePreload({
  allCoordinates,
  animationPhase,
  cameraMode,
  cinematicKeyframes,
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
    const introPose = getReplayWarmupPose({
      cameraMode,
      cinematicKeyframes,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      progress: 0,
    });
    if (!introPose) {
      setAnimationPhase('intro');
      return;
    }
    const overviewBase = getDeterministicIntroStartPose({
      coordinates: allCoordinates,
      introTo: introPose,
    });
    if (!overviewBase) {
      setAnimationPhase('intro');
      return;
    }
    // Authored targets can occur after progress zero. Keep the deterministic
    // intro fallback at sea level so a later warmup pose cannot leave its
    // elevated target behind when the primary map returns to the opening view.
    const overview = cameraMode === 'cinematic'
      && (cinematicKeyframes ?? []).some((keyframe) => keyframe.target !== undefined)
      ? { ...overviewBase, centerElevationMeters: 0 }
      : overviewBase;
    const finalPose = getReplayWarmupPose({
      cameraMode,
      cinematicKeyframes,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      progress: 1,
    });
    const openingPoses = getOpeningReplayWarmupPoses({
      cameraMode,
      cinematicKeyframes,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      totalDurationMs: totalDurationMs || 60000,
      windowMs: OPENING_WINDOW_MS,
      sampleCount: OPENING_SAMPLE_COUNT,
    });
    const bounds = new maplibregl.LngLatBounds();
    allCoordinates.forEach((coordinate) => bounds.extend(coordinate as [number, number]));
    const outroCamera = map.cameraForBounds(bounds, { padding: 100, bearing: 0, pitch: 45 });
    const outroCenter = outroCamera?.center ? maplibregl.LngLat.convert(outroCamera.center) : null;
    const outroPose: ReplayCameraPose | null = outroCamera && outroCenter
      ? {
          center: [outroCenter.lng, outroCenter.lat],
          zoom: outroCamera.zoom ?? overview.zoom,
          pitch: 45,
          bearing: outroCamera.bearing ?? 0,
        }
      : null;
    const transitions = getTransitionWarmupPoses({
      introFrom: overview,
      introTo: introPose,
      outroFrom: finalPose,
      outroTo: outroPose,
    });
    // Opening is immediately visible, so spend the real idle-wait budget there
    // first. Once the deadline expires, remaining poses are still visited with
    // zero-delay discovery; the predictive map refreshes outro coverage later.
    const poses = deduplicateCameraPoses([
      ...transitions.intro,
      ...openingPoses,
      ...transitions.outro,
    ]);
    const deadline = Date.now() + PRELOAD_TIMEOUT_MS;

    const restoreAndAdvance = () => {
      if (hasAdvancedRef.current || cancelled) return;
      hasAdvancedRef.current = true;
      if (activeTimeout) clearTimeout(activeTimeout);
      map.jumpTo(toMapCameraOptions(map, overview));
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

      map.jumpTo(toMapCameraOptions(map, pose));
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
      if (!hasAdvancedRef.current) map.jumpTo(toMapCameraOptions(map, overview));
    };
  }, [
    allCoordinates,
    animationPhase,
    cameraMode,
    cinematicKeyframes,
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
