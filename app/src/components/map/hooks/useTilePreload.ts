import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { INTRO_DURATION, OUTRO_DURATION } from '@/components/playback/PlaybackProvider';
import { BASEMAP_PRESENTATIONS } from '@/components/map/mapStyle';
import {
  type ReplayCameraMode,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';
import type { PreparedCinematicKeyframe } from '@/utils/cinematicCameraPlan';
import {
  deduplicateCameraPoses,
  getOpeningReplayWarmupPoses,
  getReplayWarmupPose,
  getTransitionWarmupPoses,
  selectBoundedCameraPoses,
} from '@/utils/replayCameraWarmupPlan';

// Each real transition owns a complete settling budget. Sharing the former six
// seconds meant the intro could consume all of it before the outro was visited.
// Broken/offline tiles still cannot strand playback indefinitely.
const TRANSITION_SETTLE_TIMEOUT_MS = 12000;
const OPENING_PLAYBACK_SETTLE_TIMEOUT_MS = 6000;
const START_POSE_SETTLE_TIMEOUT_MS = 6000;
const TRANSITION_OBSERVE_GRACE_MS = 1000;
const OPENING_WINDOW_MS = 12000;
const OPENING_SAMPLE_COUNT = 5;
const TRANSITION_FLIGHT_SAMPLE_LIMIT = 24;

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
  mapStyle: string;
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
 * HTTP cache. Playback begins after the transitions and opening camera path
 * have been visited, with bounded timeouts for unavailable providers.
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
  mapStyle,
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
    const currentCenter = map.getCenter();
    const overview: ReplayCameraPose = {
      center: [currentCenter.lng, currentCenter.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
    const introPose = getReplayWarmupPose({
      cameraMode,
      cinematicKeyframes,
      coordinates: allCoordinates,
      elevationData,
      followBehindZoomLevel,
      progress: 0,
    });
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
    // The live transitions are observed below while the preparation cover is
    // visible, then replayed through the primary map's decoded-tile cache.
    const currentPose = (): ReplayCameraPose => {
      const center = map.getCenter();
      return {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
    };

    // MapLibre's flyTo follows a van Wijk curve: centre and zoom do not move
    // linearly together. Observe that real path while the preparation cover is
    // visible so the subsequent settling pass asks for the same child tiles
    // the customer-facing intro will use.
    const observeCameraTransition = (
      startPose: ReplayCameraPose | null,
      durationMs: number,
      start: () => void,
    ) => new Promise<ReplayCameraPose[]>((resolve) => {
      if (!startPose) {
        resolve([]);
        return;
      }

      let complete = false;
      const observed: ReplayCameraPose[] = [startPose];
      const record = () => observed.push(currentPose());
      const finish = () => {
        if (complete) return;
        complete = true;
        record();
        map.off('move', record);
        map.off('moveend', finish);
        if (activeTimeout) {
          clearTimeout(activeTimeout);
          activeTimeout = null;
        }
        resolve(selectBoundedCameraPoses(observed, TRANSITION_FLIGHT_SAMPLE_LIMIT));
      };

      map.jumpTo(startPose);
      map.on('move', record);
      map.once('moveend', finish);
      activeTimeout = setTimeout(() => {
        map.stop();
        finish();
      }, durationMs + TRANSITION_OBSERVE_GRACE_MS);
      start();
    });

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

    const detailSourceId = (BASEMAP_PRESENTATIONS[mapStyle]
      ?? BASEMAP_PRESENTATIONS.satellite).sourceId;
    const warmPose = (pose: ReplayCameraPose, deadline: number) => new Promise<void>((resolve) => {
      let consecutiveReadyRenders = 0;
      const finish = () => {
        map.off('render', checkReadiness);
        if (activeTimeout) {
          clearTimeout(activeTimeout);
          activeTimeout = null;
        }
        resolve();
      };
      const checkReadiness = () => {
        let sourceReady = true;
        if (map.getSource(detailSourceId)) {
          try {
            sourceReady = map.isSourceLoaded(detailSourceId);
          } catch {
            sourceReady = false;
          }
        }
        consecutiveReadyRenders = sourceReady ? consecutiveReadyRenders + 1 : 0;
        if (consecutiveReadyRenders >= 2) finish();
        else map.triggerRepaint();
      };

      map.jumpTo(pose);
      map.on('render', checkReadiness);
      map.triggerRepaint();
      activeTimeout = setTimeout(finish, Math.max(0, deadline - Date.now()));
    });

    const settlePoses = async (poses: ReplayCameraPose[], timeoutMs: number) => {
      const deadline = Date.now() + timeoutMs;
      for (const pose of poses) {
        if (cancelled || Date.now() >= deadline) break;
        await warmPose(pose, deadline);
      }
    };

    void (async () => {
      const observedIntroPoses = await observeCameraTransition(
        overview,
        INTRO_DURATION,
        () => map.flyTo({
          ...introPose,
          duration: INTRO_DURATION,
          easing: (value) => value,
        }),
      );
      const observedOutroPoses = await observeCameraTransition(
        finalPose,
        OUTRO_DURATION,
        () => map.fitBounds(bounds, {
          padding: 100,
          pitch: 45,
          bearing: 0,
          duration: OUTRO_DURATION,
          easing: (value) => 1 - Math.pow(1 - value, 2),
        } as maplibregl.FitBoundsOptions),
      );

      const exactIntroPoses = observedIntroPoses.length > 1
        ? observedIntroPoses
        : transitions.intro;
      const exactOutroPoses = observedOutroPoses.length > 1
        ? observedOutroPoses
        : transitions.outro;

      // Warm the future outro first. The opening playback horizon follows, and
      // the intro is settled last so its child tiles are freshest at play.
      await settlePoses(deduplicateCameraPoses(exactOutroPoses), TRANSITION_SETTLE_TIMEOUT_MS);
      await settlePoses(openingPoses, OPENING_PLAYBACK_SETTLE_TIMEOUT_MS);
      await settlePoses(deduplicateCameraPoses(exactIntroPoses), TRANSITION_SETTLE_TIMEOUT_MS);
      // End at a fully rendered overview. Advancing the phase immediately after
      // jumping back used to expose the low-detail fallback while the opening
      // frame's detail tiles were still moving out of MapLibre's cache.
      await settlePoses([overview], START_POSE_SETTLE_TIMEOUT_MS);
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
    cinematicKeyframes,
    elevationData,
    followBehindZoomLevel,
    isMapLoaded,
    isPlaying,
    mapStyle,
    mapRef,
    setAnimationPhase,
    smoothBearingRef,
    targetBearingRef,
    totalDurationMs,
  ]);
}
