import type { RouteTimingMode } from '@/types';
import type { ComputedJourney, SegmentTiming } from '@/utils/journeyUtils';
import { progressForRouteDistance, routeDistanceForSegmentAnchor } from '@/utils/journeyUtils';
import { getRouteBearingAtProgress, getRouteCoordinateAtProgress } from '@/utils/replayCameraPlan';
import type { ReplayCameraPose } from '@/utils/replayCameraPlan';

/**
 * Cinematic camera mode: an authored orbit around the marker, per
 * CINEMATIC_CAMERA_PLAN.md. This module is Phase 1 of that plan — the pure
 * evaluation core. It has no UI and is not reachable from the app's camera
 * mode setting yet; it is wired into `useTrailPlaybackCamera` for testing
 * with a fixture, and exercised directly here offline.
 */

export type CinematicKeyframeFrame = 'world' | 'route';
export type CinematicKeyframeEasing = 'smooth' | 'linear' | 'hold';

/**
 * MapLibre's default Mercator zoom range. Cinematic shots deliberately allow
 * the whole range: a long journey may need a continent-scale establishing
 * shot before moving in close around a photo or landmark.
 */
export const CINEMATIC_ZOOM_MIN = 0;
export const CINEMATIC_ZOOM_MAX = 20;

/** Stable journey-segment anchor, so reordering segments moves the keyframe with its segment. Mirrors PictureAnnotation's anchor (see routeProjection.ts / usePictureRouteSync.ts) for the same reason: a raw progress value silently points at the wrong place once the journey is edited. */
export interface KeyframeAnchor {
  routeSegmentId: string;
  routeSegmentDistance: number;
}

export interface CinematicCameraKeyframe {
  id: string;
  anchor: KeyframeAnchor;
  /**
   * Which way the camera faces, in degrees. Interpretation depends on `frame`:
   *  - 'world': an absolute compass bearing. The shot is locked to the map.
   *  - 'route': an offset from the route's heading. 180 = the classic
   *    over-the-shoulder follow-behind; 90 = a fixed side-on tracking shot.
   */
  bearingDeg: number;
  /** 0 = looking straight down, 85 = almost at ground level. */
  pitchDeg: number;
  /** MapLibre zoom. Stored rather than a distance in metres — see CINEMATIC_CAMERA_PLAN.md 3.3. */
  zoom: number;
  frame: CinematicKeyframeFrame;
  /** How the camera arrives at this keyframe. */
  easing: CinematicKeyframeEasing;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Shortest signed delta from `fromDeg` to `toDeg`, in (-180, 180]. */
function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  return (((toDeg - fromDeg) % 360) + 540) % 360 - 180;
}

/**
 * Where a keyframe sits on the current route (0..1), from its stable segment
 * anchor. Exactly the pattern `usePictureRouteSync` uses for photos: derive
 * a journey-wide distance from the anchor, then a progress from that distance
 * under whichever timing mode (recorded / constant pace) is active.
 */
export function deriveCinematicKeyframeProgress(
  anchor: KeyframeAnchor,
  segmentTimings: SegmentTiming[],
  coordinates: ComputedJourney['coordinates'],
  routeTimingMode: RouteTimingMode,
): number | null {
  const routeDistance = routeDistanceForSegmentAnchor(
    segmentTimings,
    anchor.routeSegmentId,
    anchor.routeSegmentDistance,
  );
  if (routeDistance === null) return null;

  return progressForRouteDistance(coordinates, segmentTimings, routeDistance, routeTimingMode);
}

export interface PreparedCinematicKeyframe {
  id: string;
  progress: number;
  /** Unwrapped absolute compass bearing (may fall outside [0, 360)), so interpolation never spins the long way round. */
  worldBearingDeg: number;
  frame: CinematicKeyframeFrame;
  /** Route heading at this keyframe's own anchor. Only set for frame === 'route'. */
  routeHeadingAtAnchorDeg: number | null;
  pitchDeg: number;
  zoom: number;
  easing: CinematicKeyframeEasing;
}

/**
 * Sorts keyframes by their derived progress and resolves everything the
 * spline needs once, up front — never per frame:
 *  - a `route`-frame bearing is converted to an absolute compass bearing at
 *    the keyframe's own anchor (see `getCinematicCameraPose` for how a held
 *    route-frame shot keeps tracking the route afterwards).
 *  - the resulting bearing sequence is unwrapped into one continuous angle.
 */
export function prepareCinematicKeyframeTrack(
  keyframesWithProgress: Array<{ keyframe: CinematicCameraKeyframe; progress: number }>,
  coordinates: number[][],
): PreparedCinematicKeyframe[] {
  const sorted = [...keyframesWithProgress].sort((a, b) => a.progress - b.progress);
  let previousUnwrapped: number | null = null;

  return sorted.map(({ keyframe, progress }) => {
    const routeHeadingAtAnchorDeg = keyframe.frame === 'route'
      ? getRouteBearingAtProgress(coordinates, progress)
      : null;
    const rawBearing = normalizeAngle(
      keyframe.frame === 'route'
        ? (routeHeadingAtAnchorDeg ?? 0) + keyframe.bearingDeg
        : keyframe.bearingDeg,
    );
    const unwrapped = previousUnwrapped === null
      ? rawBearing
      : previousUnwrapped + shortestAngleDelta(normalizeAngle(previousUnwrapped), rawBearing);
    previousUnwrapped = unwrapped;

    return {
      id: keyframe.id,
      progress,
      worldBearingDeg: unwrapped,
      frame: keyframe.frame,
      routeHeadingAtAnchorDeg,
      pitchDeg: keyframe.pitchDeg,
      zoom: keyframe.zoom,
      easing: keyframe.easing,
    };
  });
}

export interface CinematicCameraPoseOptions {
  /** Pre-sorted, progress already derived — see `prepareCinematicKeyframeTrack`. */
  keyframes: PreparedCinematicKeyframe[];
  /** cameraPathCoordinates */
  coordinates: number[][];
  progress: number;
  /**
   * Route heading at the current progress. Only consulted for a held
   * route-frame keyframe (a single keyframe, or before the first / after the
   * last), so a locked-off "over-the-shoulder" shot keeps turning with the
   * route instead of freezing the heading it had at capture. A move between
   * two keyframes never consults it — see CINEMATIC_CAMERA_PLAN.md section 5
   * on why the route heading is not read per frame.
   */
  routeHeadingDeg: number | null;
}

const PITCH_MIN = 0;
const PITCH_MAX = 85;

function heldBearingDeg(keyframe: PreparedCinematicKeyframe, routeHeadingDeg: number | null): number {
  if (keyframe.frame !== 'route' || routeHeadingDeg === null || keyframe.routeHeadingAtAnchorDeg === null) {
    return keyframe.worldBearingDeg;
  }
  return keyframe.worldBearingDeg + shortestAngleDelta(keyframe.routeHeadingAtAnchorDeg, routeHeadingDeg);
}

function poseFromValues(
  coordinates: number[][],
  progress: number,
  bearingDeg: number,
  pitchDeg: number,
  zoom: number,
): ReplayCameraPose | null {
  const center = getRouteCoordinateAtProgress(coordinates, progress);
  if (!center) return null;

  return {
    center,
    bearing: normalizeAngle(bearingDeg),
    pitch: clamp(pitchDeg, PITCH_MIN, PITCH_MAX),
    zoom: clamp(zoom, CINEMATIC_ZOOM_MIN, CINEMATIC_ZOOM_MAX),
  };
}

/** Cubic Hermite interpolation at `t` in [0,1] between p1 and p2, with Catmull-Rom tangents derived from the neighbouring p0/p3. */
function hermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const m1 = (p2 - p0) / 2;
  const m2 = (p3 - p1) / 2;

  return (2 * t3 - 3 * t2 + 1) * p1
    + (t3 - 2 * t2 + t) * m1
    + (-2 * t3 + 3 * t2) * p2
    + (t3 - t2) * m2;
}

/**
 * The cinematic pose at a moment in the replay: a spline through
 * human-authored keyframes rather than anything derived from a noisy input,
 * per CINEMATIC_CAMERA_PLAN.md section 1. Pure and deterministic, so live
 * preview and export can call it and stay identical.
 *
 * Returns null when there are no keyframes — the caller falls back to the
 * follow-behind pose (CINEMATIC_CAMERA_PLAN.md section 7).
 */
export function getCinematicCameraPose(options: CinematicCameraPoseOptions): ReplayCameraPose | null {
  const { keyframes, coordinates, progress, routeHeadingDeg } = options;
  if (keyframes.length === 0) return null;

  const clampedProgress = clamp(progress, 0, 1);

  if (keyframes.length === 1) {
    const only = keyframes[0];
    return poseFromValues(coordinates, clampedProgress, heldBearingDeg(only, routeHeadingDeg), only.pitchDeg, only.zoom);
  }

  const first = keyframes[0];
  if (clampedProgress <= first.progress) {
    return poseFromValues(coordinates, clampedProgress, heldBearingDeg(first, routeHeadingDeg), first.pitchDeg, first.zoom);
  }

  const last = keyframes[keyframes.length - 1];
  if (clampedProgress >= last.progress) {
    return poseFromValues(coordinates, clampedProgress, heldBearingDeg(last, routeHeadingDeg), last.pitchDeg, last.zoom);
  }

  const upperIndex = keyframes.findIndex((keyframe) => keyframe.progress > clampedProgress);
  const lowerIndex = upperIndex - 1;
  const lower = keyframes[lowerIndex];
  const upper = keyframes[upperIndex];
  const span = upper.progress - lower.progress;
  const t = span > 0 ? (clampedProgress - lower.progress) / span : 0;

  if (upper.easing === 'hold') {
    // Freezes the previous keyframe's pose until this one is reached — a
    // locked-off shot, then (from the next segment onward) a move.
    return poseFromValues(coordinates, clampedProgress, lower.worldBearingDeg, lower.pitchDeg, lower.zoom);
  }

  if (upper.easing === 'linear') {
    return poseFromValues(
      coordinates,
      clampedProgress,
      lower.worldBearingDeg + (upper.worldBearingDeg - lower.worldBearingDeg) * t,
      lower.pitchDeg + (upper.pitchDeg - lower.pitchDeg) * t,
      lower.zoom + (upper.zoom - lower.zoom) * t,
    );
  }

  // 'smooth': cubic Hermite through the neighbouring keyframes with
  // Catmull-Rom tangents. The sequence's own ends stand in for the missing
  // neighbour on the first/last segment, so those segments get a defined
  // tangent without extrapolating past the authored keyframes.
  const before = keyframes[lowerIndex - 1] ?? lower;
  const after = keyframes[upperIndex + 1] ?? upper;

  const bearing = hermite(before.worldBearingDeg, lower.worldBearingDeg, upper.worldBearingDeg, after.worldBearingDeg, t);
  const pitch = hermite(before.pitchDeg, lower.pitchDeg, upper.pitchDeg, after.pitchDeg, t);
  const zoom = hermite(before.zoom, lower.zoom, upper.zoom, after.zoom, t);

  // Plain Catmull-Rom can overshoot past either endpoint's value — here that
  // means the pose punching past a limit the user never authored, between
  // two keyframes that were themselves legal. This is most visible with
  // keyframes placed close together in time: the tangent at each end is
  // derived from the *values* at its other neighbour, not scaled down for a
  // short segment, so a short segment between two very differently-posed
  // keyframes can overshoot by a huge margin — a bearing swinging hundreds
  // of degrees past either endpoint reads as the camera whipping around and
  // the marker "jumping". Clamp every channel, including bearing, to the
  // segment's own min/max regardless of how the spline got there.
  const pitchLo = Math.min(lower.pitchDeg, upper.pitchDeg);
  const pitchHi = Math.max(lower.pitchDeg, upper.pitchDeg);
  const zoomLo = Math.min(lower.zoom, upper.zoom);
  const zoomHi = Math.max(lower.zoom, upper.zoom);
  const bearingLo = Math.min(lower.worldBearingDeg, upper.worldBearingDeg);
  const bearingHi = Math.max(lower.worldBearingDeg, upper.worldBearingDeg);

  return poseFromValues(
    coordinates,
    clampedProgress,
    clamp(bearing, bearingLo, bearingHi),
    clamp(pitch, pitchLo, pitchHi),
    clamp(zoom, zoomLo, zoomHi),
  );
}
