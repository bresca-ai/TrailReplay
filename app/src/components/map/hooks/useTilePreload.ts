import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  type ReplayCameraMode,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';
import type { PreparedCinematicKeyframe } from '@/utils/cinematicCameraPlan';
import {
  deduplicateCameraPoses,
  getDeterministicIntroStartPose,
  getOpeningReplayWarmupPoses,
  getReplayWarmupPose,
  getTransitionWarmupPoses,
  sampleCameraTransition,
} from '@/utils/replayCameraWarmupPlan';

// Never hold the replay behind the preparation screen indefinitely. The opening
// sequence gets the whole budget; each camera sample may finish sooner on idle.
const PRELOAD_TIMEOUT_MS = 6000;
const POSE_TIMEOUT_MS = 350;
const RESTORED_VIEW_TIMEOUT_MS = 3000;
const OPENING_WINDOW_MS = 12000;
const OPENING_SAMPLE_COUNT = 5;

type AnimationPhase = 'idle' | 'preloading' | 'intro' | 'playing' | 'outro' | 'ended';

interface UseTilePreloadParams {
  allCoordinates: number[][];
  animationPhase: AnimationPhase;
  cameraMode: ReplayCameraMode | 'cinematic';
  cinematicKeyframes?: PreparedCinematicKeyframe[];
  cameraStability?: number;
  elevationData: Array<{ elevation: number; progress?: number }>;
  followBehindZoomLevel: number;
  followBehindPitch?: number | null;
  isMapLoaded: boolean;
  isPlaying: boolean;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  setAnimationPhase: (phase: AnimationPhase) => void;
  smoothBearingRef: React.MutableRefObject<number>;
  targetBearingRef: React.MutableRefObject<number>;
  totalDurationMs: number;
  locationBoundariesLoading?: boolean;
  aerialTerrainLoading?: boolean;
  aerialTerrainPlan?: number[] | null;
  introStartOverride?: ReplayCameraPose;
  introStageOverrides?: ReplayCameraPose[];
  backgroundWarmupReadyRef?: React.MutableRefObject<boolean>;
  fastWarmupRef?: React.MutableRefObject<boolean>;
  skipPredictivePreload?: boolean;
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
  cameraStability,
  elevationData,
  followBehindZoomLevel,
  followBehindPitch,
  isMapLoaded,
  isPlaying,
  mapRef,
  setAnimationPhase,
  smoothBearingRef,
  targetBearingRef,
  totalDurationMs,
  locationBoundariesLoading = false,
  aerialTerrainLoading = false,
  aerialTerrainPlan,
  introStartOverride,
  introStageOverrides,
  backgroundWarmupReadyRef,
  fastWarmupRef,
  skipPredictivePreload = false,
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

    // The opening reveal needs the first polygon before the fly-in starts.
    if (locationBoundariesLoading || aerialTerrainLoading) return;

    // Some basemap providers allow normal viewport loading but prohibit
    // speculative scans of future viewports.
    if (skipPredictivePreload) {
      setAnimationPhase('intro');
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
    let pendingAdvance: (() => void) | null = null;
    const originalPadding = cameraMode === 'aerial-follow' ? map.getPadding() : null;
    const introPose = getReplayWarmupPose({
      cameraMode,
      cinematicKeyframes,
      aerialTerrainPlan,
      cameraStability,
      totalDurationMs,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      followBehindPitch,
      progress: 0,
    });
    if (!introPose) {
      setAnimationPhase('intro');
      return;
    }
    const overview = introStartOverride ?? getDeterministicIntroStartPose({
      coordinates: allCoordinates,
      introTo: introPose,
    });
    if (!overview) {
      setAnimationPhase('intro');
      return;
    }
    const finalPose = getReplayWarmupPose({
      cameraMode,
      cinematicKeyframes,
      aerialTerrainPlan,
      cameraStability,
      totalDurationMs,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      followBehindPitch,
      progress: 1,
    });
    const openingPoses = getOpeningReplayWarmupPoses({
      cameraMode,
      cinematicKeyframes,
      aerialTerrainPlan,
      cameraStability,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      followBehindPitch,
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
    // Cover the first flight views before the zoom transition consumes the
    // bounded wait budget. Otherwise a slow intro can use the whole budget
    // and leave every playback pose untouched.
    const openingStages = introStageOverrides?.length ? [...introStageOverrides, introPose] : [];
    const poses = deduplicateCameraPoses([
      introPose,
      ...openingPoses,
      ...(openingStages.length > 1 ? openingStages.slice(1).flatMap((pose, index) => sampleCameraTransition(openingStages[index], pose)) : transitions.intro),
      ...transitions.outro,
    ]);
    let deadline = 0;

    const restoreAndAdvance = (immediate = false) => {
      if (hasAdvancedRef.current || cancelled) return;
      hasAdvancedRef.current = true;
      if (activeTimeout) clearTimeout(activeTimeout);
      map.jumpTo(originalPadding ? { ...overview, padding: originalPadding } : overview);
      if (introPose) {
        smoothBearingRef.current = introPose.bearing;
        targetBearingRef.current = introPose.bearing;
      }
      if (immediate) {
        setAnimationPhase('intro');
        return;
      }
      // jumpTo schedules a new render. Starting the fly-in immediately can
      // expose the last warm-up frame (or empty tiles) for the opening frame.
      // Give every restored overview a bounded chance to settle before revealing it.
      const advance = () => {
        if (cancelled || pendingAdvance !== advance) return;
        pendingAdvance = null;
        map.off('idle', advance);
        if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }
        setAnimationPhase('intro');
      };
      pendingAdvance = advance;
      map.once('idle', advance);
      activeTimeout = setTimeout(advance, RESTORED_VIEW_TIMEOUT_MS);
      map.triggerRepaint();
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

      const padding = originalPadding && {
        ...originalPadding,
        top: (originalPadding.top ?? 0) + map.getCanvas().clientHeight * 0.16,
      };
      map.jumpTo(padding ? { ...pose, padding } : pose);
      map.once('idle', finish);
      // Do not let one slow viewport consume the whole budget: the rest of
      // the zoom path still needs to submit tile requests before playback.
      activeTimeout = setTimeout(finish, Math.max(0, Math.min(POSE_TIMEOUT_MS, deadline - Date.now())));
    });

    void (async () => {
      // Let route-critical requests finish first, before the visible map
      // starts warming wide opening and closing views that compete for slots.
      while (!cancelled && backgroundWarmupReadyRef && !backgroundWarmupReadyRef.current) {
        await new Promise<void>(resolve => { activeTimeout = setTimeout(resolve, 250); });
      }
      if (cancelled) return;
      // A completed replay has already visited the opening views.
      if (fastWarmupRef?.current) {
        restoreAndAdvance(true);
        return;
      }
      deadline = Date.now() + PRELOAD_TIMEOUT_MS;
      for (const pose of poses) {
        if (cancelled || Date.now() >= deadline) break;
        await warmPose(pose);
      }
      restoreAndAdvance();
    })();

    return () => {
      cancelled = true;
      if (activeTimeout) clearTimeout(activeTimeout);
      if (pendingAdvance) map.off('idle', pendingAdvance);
      if (!hasAdvancedRef.current) map.jumpTo(originalPadding ? { ...overview, padding: originalPadding } : overview);
    };
  }, [
    allCoordinates,
    animationPhase,
    cameraMode,
    cinematicKeyframes,
    cameraStability,
    elevationData,
    followBehindZoomLevel,
    followBehindPitch,
    isMapLoaded,
    isPlaying,
    introStartOverride,
    introStageOverrides,
    locationBoundariesLoading,
    aerialTerrainLoading,
    aerialTerrainPlan,
    backgroundWarmupReadyRef,
    fastWarmupRef,
    skipPredictivePreload,
    mapRef,
    setAnimationPhase,
    smoothBearingRef,
    targetBearingRef,
    totalDurationMs,
  ]);
}
