import { REPLAY_CAMERA_MAX_PITCH } from '@/utils/cameraLimits';
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

export const CINEMATIC_BEARING_MIN = 0;
export const CINEMATIC_BEARING_MAX = 360;

export const CINEMATIC_PITCH_MIN = 0;
export const CINEMATIC_PITCH_MAX = 85;

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
  /** Local shots overlay the automatic flight. Absent means a legacy authored track. */
  scope?: 'local';
  /** Time spent at the composed view, centered on the keyframe, in video milliseconds. */
  holdDurationMs?: number;
  /** Local shots follow the automatic zoom unless the user explicitly saves a distance. */
  zoomMode?: 'automatic' | 'custom';
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
  /** Local shots overlay the automatic flight. Absent means a legacy authored track. */
  scope?: 'local';
  /** Time spent at the composed view, centered on the keyframe, in video milliseconds. */
  holdDurationMs?: number;
  /** Local shots follow the automatic zoom unless the user explicitly saves a distance. */
  zoomMode?: 'automatic' | 'custom';
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
  localHeadingAtProgress?: (progress: number) => number,
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
      routeHeadingAtAnchorDeg: keyframe.scope === 'local' && routeHeadingAtAnchorDeg !== null && localHeadingAtProgress
        ? localHeadingAtProgress(progress) : routeHeadingAtAnchorDeg,
      pitchDeg: keyframe.pitchDeg,
      zoom: keyframe.zoom,
      easing: keyframe.easing,
      scope: keyframe.scope,
      holdDurationMs: keyframe.holdDurationMs,
      zoomMode: keyframe.zoomMode,
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
const PITCH_MAX = REPLAY_CAMERA_MAX_PITCH;

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

/** Time-aware, shape-preserving tangents: no overshoot followed by a hard clamp. */
function smoothChannel(
  keyframes: PreparedCinematicKeyframe[],
  lowerIndex: number,
  channel: 'worldBearingDeg' | 'pitchDeg' | 'zoom',
  t: number,
): number {
  const upperIndex = lowerIndex + 1;
  const lower = keyframes[lowerIndex];
  const upper = keyframes[upperIndex];
  const span = upper.progress - lower.progress;
  if (span <= 0) return upper[channel];
  const slopeAt = (index: number): number => {
    // Held shots outside the authored interval have zero velocity.
    if (index === 0 || index === keyframes.length - 1) return 0;
    const before = keyframes[index - 1];
    const current = keyframes[index];
    const after = keyframes[index + 1];
    const beforeSpan = current.progress - before.progress;
    const afterSpan = after.progress - current.progress;
    if (beforeSpan <= 0 || afterSpan <= 0) return 0;
    const incoming = (current[channel] - before[channel]) / beforeSpan;
    const outgoing = (after[channel] - current[channel]) / afterSpan;
    if (incoming * outgoing <= 0) return 0;
    const w1 = 2 * afterSpan + beforeSpan;
    const w2 = afterSpan + 2 * beforeSpan;
    return (w1 + w2) / (w1 / incoming + w2 / outgoing);
  };
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * lower[channel]
    + (t3 - 2 * t2 + t) * span * slopeAt(lowerIndex)
    + (-2 * t3 + 3 * t2) * upper[channel]
    + (t3 - t2) * span * slopeAt(upperIndex);
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

  // Shape-preserving Hermite uses replay-time spacing for continuous velocity
  // at unevenly spaced shots. Flat channels stay flat; direction changes ease
  // through zero rather than hitting a clamp and sticking before moving again.
  const bearing = smoothChannel(keyframes, lowerIndex, 'worldBearingDeg', t);
  const pitch = smoothChannel(keyframes, lowerIndex, 'pitchDeg', t);
  const zoom = smoothChannel(keyframes, lowerIndex, 'zoom', t);

  // Numerical safety at the endpoints; the interpolant stays inside them.
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

export const LOCAL_SHOT_BLEND_MS = 3000;
export const LOCAL_SHOT_MAX_HOLD_MS = 60_000;

export interface LocalShotTiming {
  id: string;
  startMs: number;
  holdStartMs: number;
  holdEndMs: number;
  endMs: number;
}

/** Timing is in video time; close shots share a smooth transition. */
export function getLocalShotTimings(
  keyframes: Array<Pick<PreparedCinematicKeyframe, 'id' | 'progress' | 'scope' | 'holdDurationMs'>>,
  totalDurationMs: number,
): LocalShotTiming[] {
  if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) return [];
  const frames = keyframes.filter((frame) => frame.scope === 'local').slice().sort((a, b) => a.progress - b.progress);
  const timings = frames.map((frame) => {
    const at = clamp(frame.progress, 0, 1) * totalDurationMs;
    const hold = Number.isFinite(frame.holdDurationMs) ? clamp(frame.holdDurationMs!, 0, LOCAL_SHOT_MAX_HOLD_MS) : 0;
    const holdStartMs = Math.max(0, at - hold / 2);
    const holdEndMs = Math.min(totalDurationMs, at + hold / 2);
    return { id: frame.id, at, startMs: Math.max(0, holdStartMs - LOCAL_SHOT_BLEND_MS), holdStartMs,
      holdEndMs, endMs: Math.min(totalDurationMs, holdEndMs + LOCAL_SHOT_BLEND_MS) };
  });
  for (let i = 0; i < timings.length - 1; i++) {
    const a = timings[i];
    const b = timings[i + 1];
    if (b.holdStartMs - a.holdEndMs > 2 * LOCAL_SHOT_BLEND_MS) continue;
    if (a.holdEndMs >= b.holdStartMs) {
      // If holds overlap, reserve a short crossfade around the midpoint while
      // still reaching each authored pose at its own keyframe.
      const middle = (a.at + b.at) / 2;
      const halfFade = Math.min(500, (b.at - a.at) / 4);
      a.holdEndMs = Math.max(a.at, middle - halfFade);
      b.holdStartMs = Math.min(b.at, middle + halfFade);
    }
    a.endMs = b.holdStartMs;
    b.startMs = a.holdEndMs;
  }
  return timings;
}

/** Strength of the local-shot treatment, including overlapping transitions. */
export function localShotInfluence(timings: LocalShotTiming[], timeMs: number): number {
  const smooth = (value: number) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  return timings.reduce((strength, shot) => {
    if (timeMs < shot.startMs || timeMs > shot.endMs) return strength;
    const entering = shot.holdStartMs > shot.startMs
      ? smooth((timeMs - shot.startMs) / (shot.holdStartMs - shot.startMs)) : 1;
    const leaving = shot.endMs > shot.holdEndMs
      ? smooth((shot.endMs - timeMs) / (shot.endMs - shot.holdEndMs)) : 1;
    return Math.min(1, strength + Math.min(entering, leaving));
  }, 0);
}

/** Apply local shots to an already evaluated automatic (or legacy) pose. */
export function applyLocalCinematicShots(options: CinematicCameraPoseOptions & {
  basePose: ReplayCameraPose;
  totalDurationMs: number;
}): ReplayCameraPose {
  const local = options.keyframes.filter((frame) => frame.scope === 'local').slice().sort((a, b) => a.progress - b.progress);
  const timings = getLocalShotTimings(local, options.totalDurationMs);
  if (!timings.length) return options.basePose;
  const time = clamp(options.progress, 0, 1) * options.totalDurationMs;
  const shot = (frame: PreparedCinematicKeyframe) => {
    const pose = poseFromValues(options.coordinates, clamp(options.progress, 0, 1),
      heldBearingDeg(frame, options.routeHeadingDeg), frame.pitchDeg,
      frame.zoomMode === 'custom' ? frame.zoom : options.basePose.zoom);
    return pose && { ...options.basePose, ...pose, center: options.basePose.center };
  };
  const ease = (t: number, easing: CinematicKeyframeEasing) => easing === 'linear' ? t : t * t * (3 - 2 * t);
  const blend = (a: ReplayCameraPose, b: ReplayCameraPose, t: number): ReplayCameraPose => ({
    ...a, bearing: normalizeAngle(a.bearing + shortestAngleDelta(a.bearing, b.bearing) * t),
    pitch: a.pitch + (b.pitch - a.pitch) * t, zoom: a.zoom + (b.zoom - a.zoom) * t,
  });
  for (let i = 0; i < timings.length; i++) {
    const current = timings[i];
    if (time < current.startMs || time > current.endMs) continue;
    const target = shot(local[i]);
    if (!target) return options.basePose;
    if (time < current.holdStartMs) {
      const previous = timings[i - 1];
      if (previous && previous.endMs === current.holdStartMs && current.startMs === previous.holdEndMs) {
        const previousPose = shot(local[i - 1]);
        const span = current.holdStartMs - current.startMs;
        if (previousPose && span > 0) return blend(previousPose, target, ease((time - current.startMs) / span, local[i].easing));
      }
      const span = current.holdStartMs - current.startMs;
      if (time <= current.startMs && span > 0) return options.basePose;
      return span > 0 ? blend(options.basePose, target, ease((time - current.startMs) / span, local[i].easing)) : target;
    }
    if (time <= current.holdEndMs) return target;
    const next = timings[i + 1];
    if (next && current.endMs === next.holdStartMs && next.startMs === current.holdEndMs) {
      const nextPose = shot(local[i + 1]);
      const span = current.endMs - current.holdEndMs;
      if (nextPose && span > 0) return blend(target, nextPose, ease((time - current.holdEndMs) / span, local[i + 1].easing));
    }
    const span = current.endMs - current.holdEndMs;
    if (time >= current.endMs && span > 0) return options.basePose;
    return span > 0 ? blend(target, options.basePose, ease((time - current.holdEndMs) / span, local[i].easing)) : target;
  }
  return options.basePose;
}
