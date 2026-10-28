import { useEffect, useMemo, useRef } from 'react';
import type { Feature, LineString } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import { INTRO_DURATION, OUTRO_DURATION } from '@/components/playback/PlaybackProvider';
import { TRANSPORT_ICONS } from '@/utils/journeyUtils';
import { getActivityIconMarkerHtml, isSvgActivityIcon, markerIconContrastFilter } from '@/utils/activityIcons';
import { getHeartRateColor } from '@/utils/gpxParser';
import { buildSegmentLineFeatures } from '@/utils/trailColorFeatures';
import { buildColorZoneLineFeatures } from '@/utils/trailColorFeatures';
import type { OverlayFont, TrailColorZone } from '@/types';
import { getExportFrameFitPadding } from '@/utils/crop';
import type { CropPreviewMetrics } from '@/utils/crop';
import { overlayFontFamily } from '@/utils/typography';
import { withPaintedTrailTip, type CompletedTrailData } from '@/utils/paintedTrailTip';
import { bindPaintedTrailMarker, PaintedTrailMarker } from '@/utils/paintedTrailMarker';
import {
  cameraCenterChaseDurationFromStability,
  cameraReactivityFromStability,
  cinematicAnchorSmoothingHalfWindow,
  cinematicHeadingBaselineHalfWidth,
  frameTimeMultiplierFromDeltaMs,
  limitRateOfChange,
  MAX_CENTER_ELEVATION_RATE_M_PER_S,
  TERRAIN_SAMPLE_INDEX_OFFSETS,
  smoothBearing,
  smoothCoordinate,
  smoothPitch,
  smoothZoom,
  smoothZoomTarget,
  shouldBypassProceduralCameraSmoothing,
} from '@/components/map/cameraUtils';
import {
  getInterpolatedRouteCoordinate,
  getIntroCameraPose,
  getPlaybackCameraPose,
  getRouteBearingAtProgress,
} from '@/utils/replayCameraPlan';
import { getCinematicCenterElevation } from '@/utils/cinematicCameraElevation';
import { getCinematicCameraPose } from '@/utils/cinematicCameraPlan';
import { getDeterministicIntroStartPose } from '@/utils/replayCameraWarmupPlan';
import type { PreparedCinematicKeyframe } from '@/utils/cinematicCameraPlan';
import {
  getSmoothedCameraAnchor,
  getSmoothedRouteHeadingDeg,
  visibleWidthMetersAtZoom,
} from '@/utils/cinematicCameraAnchor';

interface UseTrailPlaybackCameraParams {
  activeTrack: { color: string; points: Array<{ heartRate: number | null }> } | null | undefined;
  activeTextAnnotationId: string | null;
  allCoordinates: number[][];
  cameraCoordinates: number[][];
  animationPhase: 'idle' | 'preloading' | 'intro' | 'playing' | 'outro' | 'ended';
  cameraMode: 'overview' | 'follow' | 'follow-behind' | 'cinematic';
  /** 0 = maximally stable/smooth camera, 1 = maximally reactive/tight tracking. */
  cameraStability: number;
  /**
   * Cinematic mode keyframes, already sorted and progress-derived (see
   * `prepareCinematicKeyframeTrack`). Not reachable from the app's camera
   * mode setting yet — CINEMATIC_CAMERA_PLAN.md Phase 1 wires this in for a
   * test fixture to drive, ahead of any authoring UI.
   */
  cinematicKeyframes?: PreparedCinematicKeyframe[];
  currentTimeMs: number;
  completedCoordinates: number[][];
  computedJourney: { coordinates: Array<{ heartRate: number | null }> } | null;
  currentIcon: string;
  currentPosition: { lat: number; lon: number; elevation: number } | null;
  recordedElevationEnabled?: boolean;
  currentSegment?: {
    segment: {
      segmentIndex?: number;
      startCoordIndex: number;
      endCoordIndex: number;
      transportMode?: string;
    };
    localProgress?: number;
  } | null;
  currentTrackColor: string | null;
  currentTrackName: string | null;
  elevationData: Array<{ elevation: number; progress?: number }>;
  exportFrame?: CropPreviewMetrics | null;
  followBehindZoomLevel: number;
  isInTransport: boolean;
  isMapLoaded: boolean;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  markerRef: React.MutableRefObject<PaintedTrailMarker | null>;
  playbackProgress: number;
  segmentTimings: Array<{
    segmentIndex: number;
    type: 'track' | 'transport';
    startCoordIndex: number;
    endCoordIndex: number;
    color?: string;
  }>;
  setCameraPosition: (position: {
    lat: number;
    lon: number;
    zoom: number;
    pitch: number;
    bearing: number;
  }) => void;
  /** Clip length. Cinematic anchor smoothing is measured in seconds of video, so it needs to know how long the video is. */
  totalDurationMs: number;
  smoothBearingRef: React.MutableRefObject<number>;
  targetBearingRef: React.MutableRefObject<number>;
  isExporting: boolean;
  isPlaying: boolean;
  sharedComparisonColors?: string[];
  trailStyle: {
    colorMode: 'fixed' | 'heartRate' | 'zones';
    colorZones: readonly TrailColorZone[];
    currentIcon: string;
    markerColor: string;
    markerSize: number;
    markerType: 'icon' | 'dot';
    overlayFont: OverlayFont;
    showCircle: boolean;
    showMarker: boolean;
    showTrackLabels: boolean;
    trailColor: string;
  };
}

export function resolvePlaybackMarkerColor(
  configuredMarkerColor: string,
  activeTrackColor: string | null | undefined,
  currentTrackColor: string | null | undefined,
): string {
  const markerFollowsTrackColors = !!activeTrackColor
    && configuredMarkerColor.toLowerCase() === activeTrackColor.toLowerCase();
  return markerFollowsTrackColors && currentTrackColor
    ? currentTrackColor
    : configuredMarkerColor;
}

export function shouldRenderPlaybackAdornment({
  activeTextAnnotationId,
  animationPhase,
  playbackProgress,
  showMarker,
  showTrackLabels,
}: {
  activeTextAnnotationId: string | null;
  animationPhase: UseTrailPlaybackCameraParams['animationPhase'];
  playbackProgress: number;
  showMarker: boolean;
  showTrackLabels: boolean;
}): boolean {
  // The moving marker is a DOM overlay, while annotation cards live in the
  // WebGL canvas. DOM markers always paint over canvas layers regardless of
  // MapLibre layer order, so remove the adornment for the annotation hold.
  // Behind an opaque annotation card it would not be visible anyway, and this
  // keeps live playback and the manually composited export frame identical.
  if (activeTextAnnotationId) return false;

  return (showMarker || showTrackLabels)
    && (animationPhase === 'intro'
      || animationPhase === 'playing'
      || (animationPhase === 'idle' && playbackProgress > 0));
}

const markerAppearanceCache = new WeakMap<HTMLElement, { html: string; label: string }>();

export function updatePlaybackMarkerElement(
  element: HTMLElement,
  markerHtml: string,
  label: { color: string; fontFamily: string; text: string } | null,
) {
  const labelSignature = JSON.stringify(label);
  const previous = markerAppearanceCache.get(element);
  if (previous?.html === markerHtml && previous.label === labelSignature) return;
  markerAppearanceCache.set(element, { html: markerHtml, label: labelSignature });
  element.innerHTML = markerHtml;
  if (!label) return;

  const labelElement = document.createElement('div');
  labelElement.className = 'tr-marker-label';
  labelElement.textContent = label.text;
  Object.assign(labelElement.style, {
    bottom: 'calc(100% + 8px)',
    color: label.color,
    fontFamily: label.fontFamily,
    fontSize: '12px',
    fontWeight: '700',
    left: '50%',
    lineHeight: '1.2',
    pointerEvents: 'none',
    position: 'absolute',
    textShadow: '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff',
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
  });
  element.appendChild(labelElement);
}

export function useTrailPlaybackCamera({
  activeTrack,
  activeTextAnnotationId,
  allCoordinates,
  cameraCoordinates,
  animationPhase,
  cameraMode,
  cameraStability,
  cinematicKeyframes,
  completedCoordinates,
  computedJourney,
  currentIcon,
  currentTimeMs,
  currentPosition,
  recordedElevationEnabled,
  currentSegment,
  currentTrackColor,
  currentTrackName,
  elevationData,
  exportFrame,
  followBehindZoomLevel,
  isExporting,
  isPlaying,
  sharedComparisonColors,
  isInTransport,
  isMapLoaded,
  mapRef,
  markerRef,
  playbackProgress,
  segmentTimings,
  setCameraPosition,
  smoothBearingRef,
  targetBearingRef,
  totalDurationMs,
  trailStyle,
}: UseTrailPlaybackCameraParams) {
  const lastCameraFrameTimeRef = useRef<number | null>(null);
  const smoothedCenterRef = useRef<[number, number] | null>(null);
  const smoothedElevationRef = useRef<number | null>(null);
  const smoothedZoomTargetRef = useRef<number | null>(null);
  const trailRevisionRef = useRef(0);

  // The height filter samples this planned anchor path, not raw switchbacks.
  // Prepare it only when authoring inputs change, never on the playback clock.
  const cinematicElevationPath = useMemo(() => {
    if (cameraMode !== 'cinematic') return [];
    const halfWindow = cinematicAnchorSmoothingHalfWindow(cameraStability, totalDurationMs / 1000);
    return cameraCoordinates.map((coordinate, index) => {
      const progress = index / Math.max(1, cameraCoordinates.length - 1);
      const pose = getCinematicCameraPose({
        keyframes: cinematicKeyframes ?? [], coordinates: cameraCoordinates,
        progress, routeHeadingDeg: null,
      }) ?? getPlaybackCameraPose({
        cameraMode: 'follow-behind', coordinates: cameraCoordinates, elevationData,
        followBehindZoomLevel, progress,
      });
      const position: [number, number] = [coordinate[0], coordinate[1]];
      return getSmoothedCameraAnchor({
        coordinates: cameraCoordinates, progress, smoothingHalfWindow: halfWindow,
        markerPosition: position, zoom: pose?.zoom ?? 14,
      });
    });
  }, [cameraMode, cameraCoordinates, cameraStability, totalDurationMs, cinematicKeyframes, elevationData, followBehindZoomLevel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;
    const unbind = recordedElevationEnabled ? () => {} : bindPaintedTrailMarker(map, () => markerRef.current);
    return () => {
      unbind();
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [isMapLoaded, mapRef, markerRef, recordedElevationEnabled]);

  const ownsCinematicElevation = (cameraMode === 'cinematic' || recordedElevationEnabled)
    && animationPhase === 'playing' && (isPlaying || isExporting);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !ownsCinematicElevation) return;
    const wasClamped = map.getCenterClampedToGround();
    // MapLibre's render loop otherwise replaces our explicit elevation with
    // raw DEM height AFTER jumpTo, undoing the spatial filter every frame.
    // This only disables look-at clamping; native camera collision stays on.
    map.setCenterClampedToGround(false);
    return () => { map.setCenterClampedToGround(wasClamped); };
  }, [isMapLoaded, mapRef, ownsCinematicElevation]);

  // Explicit distance/mode changes should take effect immediately instead of
  // being mistaken for terrain noise by the cinematic target filter.
  useEffect(() => {
    smoothedZoomTargetRef.current = null;
  }, [cameraMode, followBehindZoomLevel]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded || !currentPosition) return;

    const shouldShowPlaybackAdornment = shouldRenderPlaybackAdornment({
      activeTextAnnotationId,
      animationPhase,
      playbackProgress,
      showMarker: trailStyle.showMarker,
      showTrackLabels: trailStyle.showTrackLabels,
    });
    const currentColor = currentTrackColor || trailStyle.trailColor;
    const icon = isInTransport
      ? TRANSPORT_ICONS[currentSegment?.segment.transportMode || 'car'] || '🚗'
      : currentIcon || trailStyle.currentIcon;

    if (!shouldShowPlaybackAdornment) {
      markerRef.current?.remove();
      markerRef.current = null;
    } else {
      const markerColor = resolvePlaybackMarkerColor(
        trailStyle.markerColor,
        activeTrack?.color,
        currentTrackColor,
      );
      let markerHtml = '';

      if (trailStyle.showMarker && trailStyle.markerType === 'dot') {
        const dotSize = Math.round(14 * trailStyle.markerSize);
        const dotColors = [markerColor, ...(sharedComparisonColors ?? [])];
        const dotFill = dotColors.length === 1 ? markerColor : `conic-gradient(${dotColors.map((color, index) =>
          `${color} ${index * 100 / dotColors.length}% ${(index + 1) * 100 / dotColors.length}%`).join(', ')})`;
        markerHtml = `<div data-marker-dot data-marker-colors="${encodeURIComponent(JSON.stringify(dotColors))}" style="
          width: ${dotSize}px;
          height: ${dotSize}px;
          background: ${dotFill};
          border-radius: 50%;
          border: 2.5px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          flex-shrink: 0;
        "></div>`;
      } else if (trailStyle.showMarker) {
        const fontSize = Math.round(28 * trailStyle.markerSize);
        const iconColor = isSvgActivityIcon(icon) ? markerColor : currentColor;
        const iconHtml = getActivityIconMarkerHtml(icon, fontSize, iconColor);
        // Keep showCircle as the saved setting for recipe/project compatibility.
        // Contrast follows the icon silhouette, without a disc or pulse animation.
        markerHtml = `<div data-marker-icon style="filter:${trailStyle.showCircle ? markerIconContrastFilter() : 'none'};">${iconHtml}</div>`;
      }

      if (!markerRef.current) {
        const element = document.createElement('div');
        element.className = 'tr-marker';
        element.style.alignItems = 'center';
        element.style.display = 'flex';
        element.style.justifyContent = 'center';
        element.style.zIndex = '100';
        updatePlaybackMarkerElement(
          element,
          markerHtml,
          trailStyle.showTrackLabels && currentTrackName
            ? {
                color: currentColor,
                fontFamily: overlayFontFamily(trailStyle.overlayFont),
                text: currentTrackName,
              }
            : null,
        );
        markerRef.current = new PaintedTrailMarker(
          element, mapRef.current.getCanvasContainer(), trailRevisionRef.current + 1,
        );
      } else {
        updatePlaybackMarkerElement(
          markerRef.current.getElement(),
          markerHtml,
          trailStyle.showTrackLabels && currentTrackName
            ? {
                color: currentColor,
                fontFamily: overlayFontFamily(trailStyle.overlayFont),
                text: currentTrackName,
              }
            : null,
        );
      }
    }

    const completedTrailSource = mapRef.current.getSource('trail-completed') as maplibregl.GeoJSONSource | undefined;
    if (completedCoordinates.length > 0 && completedTrailSource) {
      const paintCompletedTrail = (data: CompletedTrailData) => {
        // Native source updates coalesce worker work. The rendered tip, rather
        // than completion of a worker promise or an unrelated render, tells us
        // which frame's endpoint is actually visible.
        const revision = ++trailRevisionRef.current;
        const start = completedCoordinates.at(-1);
        void completedTrailSource.setData(withPaintedTrailTip(
          data, revision, start ? [start[0], start[1]] : null,
        ));
      };

      if (trailStyle.colorMode === 'heartRate') {
        const features: Array<Feature<LineString, { color: string }>> = [];
        const heartRatePoints = activeTrack && !computedJourney
          ? activeTrack.points
          : computedJourney?.coordinates ?? [];

        for (let index = 0; index < completedCoordinates.length - 1; index++) {
          const heartRate = heartRatePoints[index]?.heartRate;
          features.push({
            type: 'Feature',
            properties: { color: heartRate ? getHeartRateColor(heartRate, 180) : trailStyle.trailColor },
            geometry: {
              type: 'LineString',
              coordinates: [completedCoordinates[index], completedCoordinates[index + 1]],
            },
          });
        }

        paintCompletedTrail({
          type: 'FeatureCollection',
          features,
        });
      } else if (trailStyle.colorMode === 'zones') {
        // Keep the completed line to the marker's exact fractional coordinate.
        // `completedCoordinates` includes the next whole point followed by the
        // interpolated marker position, so deriving an index from its length
        // would draw the line ahead of the marker between GPS samples.
        const activeSegment = currentSegment?.segment;
        const localProgress = currentSegment?.localProgress;
        const completedBaseIndex = activeSegment && localProgress !== undefined
          ? activeSegment.startCoordIndex + (
              Math.max(0, Math.min(1, localProgress))
              * (activeSegment.endCoordIndex - activeSegment.startCoordIndex)
            )
          : playbackProgress * Math.max(0, allCoordinates.length - 1);
        const zoneFeatures = buildColorZoneLineFeatures({
          coordinates: allCoordinates,
          colorZones: trailStyle.colorZones,
          fallbackColor: trailStyle.trailColor,
          maxCoordIndex: completedBaseIndex,
          partialEndpoint: currentPosition ? [currentPosition.lon, currentPosition.lat] : null,
        });

        paintCompletedTrail({
          type: 'FeatureCollection',
          features: zoneFeatures,
        });
      } else {
        const completedBaseIndex = Math.max(0, Math.min(allCoordinates.length - 1, completedCoordinates.length - 2));
        const coloredFeatures = buildSegmentLineFeatures({
          coordinates: allCoordinates,
          segmentTimings,
          fallbackColor: trailStyle.trailColor,
          maxCoordIndex: completedBaseIndex,
          partialEndpoint: currentPosition ? [currentPosition.lon, currentPosition.lat] : null,
          partialSegmentIndex: currentSegment?.segment.segmentIndex ?? null,
        });

        paintCompletedTrail(
          coloredFeatures.length > 0
            ? {
                type: 'FeatureCollection',
                features: coloredFeatures,
              }
            : {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: completedCoordinates },
              }
        );
      }
    }

    if (animationPhase === 'playing' && cameraMode !== 'overview') {
      // The one dial cinematic mode has, in fractions of the whole replay.
      const anchorSmoothingHalfWindow = cinematicAnchorSmoothingHalfWindow(
        cameraStability,
        totalDurationMs / 1000,
      );

      // A cinematic shot follows the line the route takes over several
      // seconds of video, not the tangent at this instant — otherwise it
      // turns with every switchback, which is the shake this mode exists to
      // remove. Measured on a 206 km route as a 60 s clip, this reduces total
      // camera turning from 1780 degrees to 286, with no direction reversals
      // at all, against follow-behind's smoothed 921 degrees and 19.
      const cinematicHeadingDeg = cameraMode === 'cinematic'
        ? getSmoothedRouteHeadingDeg({
            coordinates: cameraCoordinates,
            progress: playbackProgress,
            smoothingHalfWindow: anchorSmoothingHalfWindow,
            baselineHalfWidth: cinematicHeadingBaselineHalfWidth(anchorSmoothingHalfWindow),
          }) ?? getRouteBearingAtProgress(cameraCoordinates, playbackProgress)
        : 0;

      // Cinematic mode has no procedural input to derive a pose from: it
      // splines through authored keyframes instead (CINEMATIC_CAMERA_PLAN.md
      // section 1). With no keyframes yet it falls back to follow-behind's
      // framing (section 7) so switching modes never produces a broken
      // camera — but it takes its *heading* from the long-baseline reading
      // above rather than follow-behind's.
      //
      // That distinction was a real bug: the whole smoothing chain is
      // bypassed in this mode (`usesRawPose`, on the grounds that an authored
      // spline needs no filtering), so borrowing follow-behind's pose whole
      // meant borrowing its raw per-frame heading with the smoothing that
      // makes it usable switched off. Cinematic-with-no-keyframes was
      // therefore *shakier* than follow-behind, which is the opposite of what
      // the mode is for.
      const cinematicFallbackPose = () => {
        const followBehindPose = getPlaybackCameraPose({
          cameraMode: 'follow-behind',
          coordinates: cameraCoordinates,
          elevationData,
          followBehindZoomLevel,
          progress: playbackProgress,
        });
        return followBehindPose && { ...followBehindPose, bearing: cinematicHeadingDeg };
      };

      const targetPose = cameraMode === 'cinematic'
        ? getCinematicCameraPose({
            keyframes: cinematicKeyframes ?? [],
            coordinates: cameraCoordinates,
            progress: playbackProgress,
            routeHeadingDeg: cinematicHeadingDeg,
          }) ?? cinematicFallbackPose()
        : getPlaybackCameraPose({
            cameraMode,
            coordinates: cameraCoordinates,
            elevationData,
            followBehindZoomLevel,
            progress: playbackProgress,
          });
      if (!targetPose) return;

      // Cinematic mode's pose is already smooth by construction (it comes
      // from a spline through authored keyframes, not a noisy input) — the
      // smoothing/deadband/rate-limiting machinery below exists to reject
      // noise this mode doesn't have, and would turn an authored move into a
      // stepped or laggy one. Bypass it the same way 'follow' already does.
      // CINEMATIC_CAMERA_PLAN.md section 5.
      const usesRawPose = shouldBypassProceduralCameraSmoothing(
        cameraMode,
        cinematicKeyframes?.length ?? 0,
      );

      // Follow the replay plan's evenly sampled forward heading. Raw GPX
      // bearings can jump at uneven samples and make tight turns feel abrupt.
      const reactivity = cameraReactivityFromStability(cameraStability);

      // The smoothing calls below cap how far the camera may move *per call*,
      // not per second — so calling them more often (a higher live frame rate,
      // or a higher export fps) previously made the camera move faster and
      // travel further over the same clip. Scale by the elapsed *simulated*
      // playback time since the last call (not wall-clock time) so the
      // camera's speed relative to the route stays constant. Wall-clock time
      // would be wrong here: deterministic export advances `currentTimeMs` by
      // a fixed step per encoded frame regardless of how long each frame
      // actually takes to render and encode, so the real elapsed time between
      // calls doesn't reflect the export fps at all.
      const deltaMs = lastCameraFrameTimeRef.current !== null
        ? currentTimeMs - lastCameraFrameTimeRef.current
        : null;
      lastCameraFrameTimeRef.current = currentTimeMs;
      const frameTimeMultiplier = deltaMs !== null ? frameTimeMultiplierFromDeltaMs(deltaMs) : 1;

      targetBearingRef.current = targetPose.bearing;
      smoothBearingRef.current = smoothBearing(
        smoothBearingRef.current,
        targetPose.bearing,
        undefined,
        undefined,
        reactivity,
        frameTimeMultiplier,
      );

      const currentZoom = mapRef.current.getZoom();
      const stabilizedZoomTarget = smoothedZoomTargetRef.current === null || deltaMs === null
        ? targetPose.zoom
        : smoothZoomTarget(
            smoothedZoomTargetRef.current,
            targetPose.zoom,
            deltaMs,
            cameraStability,
          );
      smoothedZoomTargetRef.current = stabilizedZoomTarget;
      const newZoom = smoothZoom(
        currentZoom,
        stabilizedZoomTarget,
        undefined,
        undefined,
        reactivity,
        frameTimeMultiplier,
      );
      const newPitch = smoothPitch(mapRef.current.getPitch(), targetPose.pitch, undefined, undefined, reactivity, frameTimeMultiplier);

      // Chase the marker's exact position the same way live playback used to
      // get "for free" from re-triggering `map.easeTo({ center, duration: 100 })`
      // every animation frame (see smoothCoordinate's doc comment for why that
      // can't be used directly during export). Compute it by hand here so both
      // paths land on the same rendered position.
      const targetCenter: [number, number] = [currentPosition.lon, currentPosition.lat];
      const centerChaseDuration = cameraCenterChaseDurationFromStability(cameraStability);
      const chasedCenter = smoothedCenterRef.current === null || deltaMs === null
        ? targetCenter
        : smoothCoordinate(smoothedCenterRef.current, targetCenter, deltaMs, centerChaseDuration);
      // Cinematic mode does not chase the marker at all. A chase is a lag
      // filter, and a lagged centre falls out of step with a pose that jumps
      // straight to its spline value — that mismatch is what made the marker
      // appear to slide off the track. It also cannot help with the real
      // problem: welded to the marker or trailing behind it, the camera still
      // reproduces every switchback, because the path it is following is the
      // one with the switchbacks in it.
      //
      // Smooth the *path* instead, symmetrically, using route that is still
      // to come as well as route already travelled — which a live camera
      // could never do, and which costs no lag precisely because it is
      // symmetric. The marker stays exactly on its trace and weaves inside
      // the frame; the frame itself glides. See cinematicCameraAnchor.ts.
      const smoothedCenter = cameraMode === 'cinematic'
        ? getSmoothedCameraAnchor({
            coordinates: cameraCoordinates,
            progress: playbackProgress,
            smoothingHalfWindow: anchorSmoothingHalfWindow,
            markerPosition: targetCenter,
            zoom: targetPose.zoom,
          })
        : chasedCenter;
      smoothedCenterRef.current = smoothedCenter;

      // With 3D terrain the marker is drawn on the terrain surface, while the
      // camera aims at the centre point's elevation. Apply the height together
      // with the complete pose below. setCenterElevation itself calls jumpTo:
      // using it first applies the new height at the OLD centre/zoom/pitch,
      // invokes terrain collision correction, and publishes a second camera
      // move every playback frame. `queryTerrainElevation` already
      // includes the terrain exaggeration and returns null when terrain is
      // off, in which case we leave the elevation alone.
      //
      // Read that height as an average over a span of route rather than from
      // the single point under the marker: at this compression one frame covers
      // tens of metres of ground, so sampling one point tracked every hummock
      // in the terrain mesh and the view bobbed constantly. Averaging
      // symmetrically leaves constant gradient untouched, so this costs no
      // accuracy on a climb — see cameraUtils' TERRAIN_SAMPLE_INDEX_OFFSETS for
      // why a time-based lag is the wrong tool here.
      // Fractional base index, and interpolated sample positions with it: this
      // window is read every frame but the route only has a sample every sixth
      // one, so rounding here would slide it a whole sample at a time and step
      // the averaged height ten times a second.
      const sampleBaseIndex = Math.max(0, Math.min(1, playbackProgress))
        * Math.max(0, cameraCoordinates.length - 1);
      let elevationSum = 0;
      let elevationSamples = 0;

      // Cinematic height follows a symmetric spatial average on the planned
      // anchor path. Raw terrain under one point makes the view bob over mesh
      // detail; a time chase instead lags behind genuine sustained climbs.
      if (cameraMode === 'cinematic') {
        const halfWindowSeconds = 0.15 + 0.75 * (1 - Math.max(0, Math.min(1, cameraStability)));
        const sampled = getCinematicCenterElevation({
          coordinates: cinematicElevationPath,
          center: smoothedCenter,
          progress: playbackProgress,
          halfWindow: halfWindowSeconds / Math.max(1, totalDurationMs / 1000),
          maxDeviationMeters: visibleWidthMetersAtZoom(targetPose.zoom, smoothedCenter[1]) * 0.08,
          readElevation: (position) => mapRef.current!.queryTerrainElevation(position),
        });
        if (sampled !== null) {
          elevationSum = sampled;
          elevationSamples = 1;
        }
      } else if (usesRawPose) {
        // Unfiltered follow mode aims directly at its current center.
        const sampled = mapRef.current.queryTerrainElevation([smoothedCenter[0], smoothedCenter[1]]);
        if (typeof sampled === 'number' && Number.isFinite(sampled)) {
          elevationSum = sampled;
          elevationSamples = 1;
        }
      } else {
        for (const offset of TERRAIN_SAMPLE_INDEX_OFFSETS) {
          const coordinate = getInterpolatedRouteCoordinate(cameraCoordinates, sampleBaseIndex + offset);
          if (!coordinate) continue;

          const sampled = mapRef.current.queryTerrainElevation([coordinate[0], coordinate[1]]);
          if (typeof sampled === 'number' && Number.isFinite(sampled)) {
            elevationSum += sampled;
            elevationSamples++;
          }
        }
      }

      let centerElevation: { elevation?: number } = {};

      if (elevationSamples > 0) {
        const averaged = elevationSum / elevationSamples;
        const previousElevation = smoothedElevationRef.current;
        const settled = usesRawPose || cameraMode === 'cinematic' || previousElevation === null || deltaMs === null
          ? averaged
          : limitRateOfChange(previousElevation, averaged, deltaMs, MAX_CENTER_ELEVATION_RATE_M_PER_S);

        smoothedElevationRef.current = settled;
        centerElevation = { elevation: settled };
      } else {
        smoothedElevationRef.current = null;
      }

      if (recordedElevationEnabled && currentPosition && Number.isFinite(currentPosition.elevation)) {
        const terrain = mapRef.current.queryTerrainElevation([currentPosition.lon, currentPosition.lat]);
        centerElevation = { elevation: terrain == null ? currentPosition.elevation : Math.max(currentPosition.elevation, terrain + 1) };
      }

      // Apply the already-smoothed pose with `jumpTo` rather than `easeTo` in
      // both live playback and export. `easeTo` used to be how live playback
      // got its center-panning smoothing, but that made it diverge from
      // export (which must render a fully-settled pose per encoded frame, so
      // it always used `jumpTo`) — the live preview looked stable while the
      // export was visibly twitchier, since it was missing that lag. Now that
      // `smoothedCenter` reproduces the same lag deterministically, both
      // paths apply identical values the same way.
      mapRef.current.jumpTo({
        ...targetPose,
        ...centerElevation,
        center: smoothedCenter,
        zoom: usesRawPose ? targetPose.zoom : newZoom,
        pitch: usesRawPose ? targetPose.pitch : newPitch,
        bearing: usesRawPose ? targetPose.bearing : smoothBearingRef.current,
      });
    } else {
      // Playback is paused/idle or a new export is starting: don't let a gap
      // since the last frame (e.g. time spent paused) be read as an elapsed
      // delta once playback resumes.
      lastCameraFrameTimeRef.current = null;
      smoothedZoomTargetRef.current = null;
    }

    setCameraPosition({
      lat: mapRef.current.getCenter().lat,
      lon: mapRef.current.getCenter().lng,
      zoom: mapRef.current.getZoom(),
      pitch: mapRef.current.getPitch(),
      bearing: mapRef.current.getBearing(),
    });
  }, [
    activeTrack,
    activeTextAnnotationId,
    allCoordinates,
    animationPhase,
    cameraMode,
    cameraStability,
    cameraCoordinates,
    cinematicKeyframes,
    cinematicElevationPath,
    completedCoordinates,
    computedJourney,
    currentIcon,
    currentPosition,
    recordedElevationEnabled,
    currentSegment,
    currentTimeMs,
    currentTrackColor,
    currentTrackName,
    elevationData,
    followBehindZoomLevel,
    isInTransport,
    isMapLoaded,
    mapRef,
    markerRef,
    playbackProgress,
    segmentTimings,
    setCameraPosition,
    sharedComparisonColors,
    smoothBearingRef,
    targetBearingRef,
    totalDurationMs,
    trailStyle,
  ]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    if (cameraMode === 'overview' && allCoordinates.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      allCoordinates.forEach((coordinate) => bounds.extend(coordinate as [number, number]));
      mapRef.current.fitBounds(bounds, { padding: 100, duration: 500 });
    }
  }, [allCoordinates, cameraMode, isMapLoaded, mapRef]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    // The fly-in must finish on the same pose used by the first playback
    // frame (see getIntroCameraPose's own comment on this), so cinematic
    // mode targets its first keyframe's pose here rather than the
    // follow-behind intro target.
    const introPose = cameraMode === 'cinematic'
      ? getCinematicCameraPose({
          keyframes: cinematicKeyframes ?? [],
          coordinates: cameraCoordinates,
          progress: 0,
          routeHeadingDeg: getRouteBearingAtProgress(cameraCoordinates, 0),
        }) ?? getIntroCameraPose({
          cameraMode: 'follow-behind',
          coordinates: cameraCoordinates,
          elevationData,
          followBehindZoomLevel,
          progress: 0,
        })
      : getIntroCameraPose({
          cameraMode,
          coordinates: cameraCoordinates,
          elevationData,
          followBehindZoomLevel,
          progress: 0,
        });

    if (animationPhase === 'intro' && introPose) {
      const introStartPose = getDeterministicIntroStartPose({
        coordinates: allCoordinates,
        introTo: introPose,
      });
      mapRef.current.stop();
      if (introStartPose) mapRef.current.jumpTo(introStartPose);
      mapRef.current.flyTo({
        ...introPose,
        duration: INTRO_DURATION,
        // Ease both ends: linger just long enough on the country-scale start
        // marker to establish location, then settle into the first playback
        // pose without the old ease-out's apparent pause.
        easing: (value) => value * value * (3 - 2 * value),
      });

      smoothBearingRef.current = introPose.bearing;
      targetBearingRef.current = introPose.bearing;
    } else if (animationPhase === 'outro' && cameraMode !== 'overview' && allCoordinates.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      allCoordinates.forEach((coordinate) => bounds.extend(coordinate as [number, number]));
      mapRef.current.fitBounds(bounds, {
        padding: exportFrame ? getExportFrameFitPadding(exportFrame) : 100,
        pitch: 45,
        bearing: 0,
        duration: OUTRO_DURATION,
        easing: (value) => 1 - Math.pow(1 - value, 2),
      } as maplibregl.FitBoundsOptions);
    } else if (animationPhase === 'idle' && !isExporting && cameraMode !== 'cinematic' && allCoordinates.length > 0) {
      // Cinematic authoring happens while paused: the whole point is to pose
      // a precise shot and capture it. Snapping back to the full-route
      // overview every time this effect re-runs (e.g. a keyframe is added,
      // changing `cinematicKeyframes`) would yank away the framing the user
      // just composed.
      const bounds = new maplibregl.LngLatBounds();
      allCoordinates.forEach((coordinate) => bounds.extend(coordinate as [number, number]));
      mapRef.current.fitBounds(bounds, { padding: 100, duration: 1000 });
    }
  }, [
    allCoordinates,
    animationPhase,
    cameraMode,
    cameraCoordinates,
    cinematicKeyframes,
    elevationData,
    exportFrame,
    followBehindZoomLevel,
    isExporting,
    isMapLoaded,
    mapRef,
    smoothBearingRef,
    targetBearingRef,
  ]);
}
