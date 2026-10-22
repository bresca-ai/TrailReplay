import { getFollowBehindCameraTarget } from '@/utils/followBehindCamera';
import {
  calculateTerrainAwareAdjustments,
  TERRAIN_CAMERA_SETTINGS,
} from '@/components/map/cameraUtils';

export type ReplayCameraMode = 'overview' | 'follow' | 'follow-behind';

export interface ReplayCameraPose {
  bearing: number;
  center: [number, number];
  /** Explicit terrain-aware camera aim height, in metres above sea level. */
  centerElevationMeters?: number;
  pitch: number;
  zoom: number;
}

interface CameraPlanOptions {
  cameraMode: ReplayCameraMode;
  coordinates: number[][];
  elevationData: Array<{ elevation: number; progress?: number }>;
  followBehindZoomLevel: number;
  progress: number;
}

const FOLLOW_CAMERA_ZOOM = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Position at a fractional point between two route samples.
 *
 * The camera path is resampled to a fixed number of points, but playback
 * progress is continuous, so rounding progress to the nearest sample makes
 * every value derived from it a staircase. Measured on a 60s clip at 60fps
 * there are 601 samples against 3600 frames: the index advances once every six
 * frames, so anything read this way holds still for six frames and then jumps —
 * a ten-per-second train of impulses that the pose smoothing answers with a
 * little lurch each time. That reads as the camera trembling. Interpolating
 * between the two neighbouring samples makes the reading continuous, and there
 * is nothing left to lurch at.
 */
export function getInterpolatedRouteCoordinate(
  coordinates: number[][],
  fractionalIndex: number,
): [number, number] | null {
  const last = coordinates.length - 1;
  if (last < 0) return null;

  const clamped = clamp(fractionalIndex, 0, last);
  const lowerIndex = Math.floor(clamped);
  const upperIndex = Math.min(last, lowerIndex + 1);
  const lower = coordinates[lowerIndex];
  const upper = coordinates[upperIndex];
  if (!lower || !upper) return null;

  const fraction = clamped - lowerIndex;
  return [
    lower[0] + (upper[0] - lower[0]) * fraction,
    lower[1] + (upper[1] - lower[1]) * fraction,
  ];
}

export function getRouteCoordinateAtProgress(
  coordinates: number[][],
  progress: number,
): [number, number] | null {
  if (coordinates.length === 0) return null;

  return getInterpolatedRouteCoordinate(
    coordinates,
    clamp(progress, 0, 1) * (coordinates.length - 1),
  );
}

/** How far ahead the camera looks to decide which way the route is going. */
const BEARING_LOOK_AHEAD_SAMPLES = 16;

/**
 * Samples either side of each end of the look-ahead chord that get averaged
 * together. Zero would reproduce the old single-point behaviour.
 */
const BEARING_SMOOTHING_HALF_WINDOW = 4;

function bearingBetween(from: number[], to: number[]): number {
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const lon1 = (from[0] * Math.PI) / 180;
  const lon2 = (to[0] * Math.PI) / 180;
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Mean position of the samples around a whole-numbered `centre`. */
function centroidAtSample(coordinates: number[][], centre: number, halfWindow: number): number[] {
  const last = coordinates.length - 1;
  const middle = Math.max(0, Math.min(last, centre));
  let lon = 0;
  let lat = 0;
  let count = 0;

  for (let index = Math.max(0, middle - halfWindow); index <= Math.min(last, middle + halfWindow); index++) {
    const coordinate = coordinates[index];
    if (!coordinate) continue;
    lon += coordinate[0];
    lat += coordinate[1];
    count++;
  }

  return count > 0 ? [lon / count, lat / count] : coordinates[middle];
}

/**
 * Mean position around a fractional point on the route.
 *
 * Blends the windows either side of it rather than snapping to one, for the
 * same reason `getInterpolatedRouteCoordinate` exists: a window that jumps a
 * whole sample at a time hands the camera a step to react to six frames apart.
 * A centroid is linear in its samples, so interpolating between the two
 * neighbouring centroids is the same as sliding the window continuously.
 */
function localCentroid(coordinates: number[][], centre: number, halfWindow: number): number[] {
  const last = coordinates.length - 1;
  const clamped = Math.max(0, Math.min(last, centre));
  const lowerIndex = Math.floor(clamped);
  const fraction = clamped - lowerIndex;

  const lower = centroidAtSample(coordinates, lowerIndex, halfWindow);
  if (fraction === 0) return lower;

  const upper = centroidAtSample(coordinates, Math.min(last, lowerIndex + 1), halfWindow);
  return [
    lower[0] + (upper[0] - lower[0]) * fraction,
    lower[1] + (upper[1] - lower[1]) * fraction,
  ];
}

/**
 * Which way the route is heading — the direction the camera turns to face.
 *
 * Measured between the *average* position around the marker and the average
 * position a little further along, rather than between two single points. A
 * two-point chord inherits the wobble of both of its endpoints, so the heading
 * it reports swings even while the route's actual direction is unchanged, and
 * the camera answers every one of those swings by rotating. Measured on real
 * routes, that chord changed direction 80 times on an 11 km route and 137 times
 * on a 206 km one, with single frames jumping as much as 36 degrees.
 *
 * Averaging both ends cancels the wobble while leaving the real turn: the same
 * routes report 28 and 29 direction changes, and the camera that follows them
 * reverses roughly half as often (32 -> 15 and 30 -> 19 at maximum stability).
 * The practical effect is the one that matters — when the marker shuffles
 * sideways but the path ahead still runs the same way, the camera now holds
 * still and lets the marker do the moving.
 */
export function getRouteBearingAtProgress(
  coordinates: number[][],
  progress: number,
): number {
  if (coordinates.length < 2) return 0;

  const last = coordinates.length - 1;
  // Fractional, not rounded: see getInterpolatedRouteCoordinate for why.
  const index = clamp(progress, 0, 1) * last;
  const aheadIndex = Math.min(index + BEARING_LOOK_AHEAD_SAMPLES, last);

  const from = localCentroid(coordinates, index, BEARING_SMOOTHING_HALF_WINDOW);
  const to = localCentroid(coordinates, aheadIndex, BEARING_SMOOTHING_HALF_WINDOW);
  if (!from || !to) return 0;

  // Near the end of the route the two windows overlap enough to collapse onto
  // the same point; fall back to the plain chord so the heading stays defined.
  if (from[0] === to[0] && from[1] === to[1]) {
    const current = getInterpolatedRouteCoordinate(coordinates, index);
    const lookAhead = getInterpolatedRouteCoordinate(coordinates, aheadIndex);
    if (!current || !lookAhead) return 0;
    if (current[0] === lookAhead[0] && current[1] === lookAhead[1]) return 0;
    return bearingBetween(current, lookAhead);
  }

  return bearingBetween(from, to);
}

/** Camera pose at the end of the cinematic intro. */
export function getIntroCameraPose(options: CameraPlanOptions): ReplayCameraPose | null {
  const center = getRouteCoordinateAtProgress(options.coordinates, options.progress);
  if (!center || options.cameraMode === 'overview') return null;

  if (options.cameraMode === 'follow') {
    return { center, zoom: FOLLOW_CAMERA_ZOOM, pitch: 0, bearing: 0 };
  }

  // The fly-in must finish on the same pose used by the first playback frame.
  // A separate, more distant intro target created a visible second zoom after
  // the fly-in before the marker could begin moving along the route.
  const preset = getFollowBehindCameraTarget(options.followBehindZoomLevel, 'playback');
  const elevationIndex = Math.round(clamp(options.progress, 0, 1) * Math.max(0, options.elevationData.length - 1));
  const elevation = options.elevationData[elevationIndex]?.elevation ?? 0;
  const { zoomAdjust, pitchAdjust } = calculateTerrainAwareAdjustments(
    elevation,
    options.elevationData,
    options.progress,
  );

  return {
    center,
    zoom: Math.max(TERRAIN_CAMERA_SETTINGS.MIN_ZOOM, preset.zoom - zoomAdjust),
    pitch: Math.max(TERRAIN_CAMERA_SETTINGS.MIN_PITCH, preset.pitch - pitchAdjust),
    bearing: getRouteBearingAtProgress(options.coordinates, options.progress),
  };
}

/** Steady-state pose that the playback camera converges toward. */
export function getPlaybackCameraPose(options: CameraPlanOptions): ReplayCameraPose | null {
  const center = getRouteCoordinateAtProgress(options.coordinates, options.progress);
  if (!center || options.cameraMode === 'overview') return null;

  if (options.cameraMode === 'follow') {
    return { center, zoom: FOLLOW_CAMERA_ZOOM, pitch: 0, bearing: 0 };
  }

  const preset = getFollowBehindCameraTarget(options.followBehindZoomLevel, 'playback');
  const elevationIndex = Math.round(clamp(options.progress, 0, 1) * Math.max(0, options.elevationData.length - 1));
  const elevation = options.elevationData[elevationIndex]?.elevation ?? 0;
  const { zoomAdjust, pitchAdjust } = calculateTerrainAwareAdjustments(
    elevation,
    options.elevationData,
    options.progress,
  );
  return {
    center,
    // The old code applied terrain protection only to the intro fly-in, then
    // restored the close preset for every playback frame. On long climbs that
    // made the marker leave the close, pitched viewport. Keep this correction
    // active for the full replay so the camera opens as elevation increases.
    // Do not cap to the intro's conservative maximums here: at low altitude a
    // user-selected close preset must remain genuinely close. The adjustments
    // only ever widen/flatten the view and cannot overshoot the safe minima.
    zoom: Math.max(TERRAIN_CAMERA_SETTINGS.MIN_ZOOM, preset.zoom - zoomAdjust),
    pitch: Math.max(TERRAIN_CAMERA_SETTINGS.MIN_PITCH, preset.pitch - pitchAdjust),
    bearing: getRouteBearingAtProgress(options.coordinates, options.progress),
  };
}

export function getOpeningPreloadProgresses(
  totalDurationMs: number,
  windowMs: number,
  sampleCount: number,
): number[] {
  const duration = Math.max(1, totalDurationMs);
  const endProgress = clamp(windowMs / duration, 0, 1);
  const count = Math.max(1, Math.floor(sampleCount));

  return Array.from({ length: count }, (_, index) => (
    count === 1 ? 0 : (endProgress * index) / (count - 1)
  ));
}

/**
 * Produces a denser set of poses around future turns. Each route sample has an
 * additional forward-bearing pose so a pitched camera turning into a new view
 * warms both the outgoing and incoming edges of its frustum.
 */
export function getPredictivePlaybackPoses({
  currentProgress,
  horizonMs,
  options,
  sampleCount,
  totalDurationMs,
}: {
  currentProgress: number;
  horizonMs: number;
  options: Omit<CameraPlanOptions, 'progress'>;
  sampleCount: number;
  totalDurationMs: number;
}): ReplayCameraPose[] {
  const progresses = getOpeningPreloadProgresses(totalDurationMs, horizonMs, sampleCount)
    .map((offset) => clamp(currentProgress + offset, 0, 1));
  const poses: ReplayCameraPose[] = [];

  for (const [index, progress] of progresses.entries()) {
    const pose = getPlaybackCameraPose({ ...options, progress });
    if (!pose) continue;
    poses.push(pose);

    const nextProgress = progresses[Math.min(index + 1, progresses.length - 1)] ?? progress;
    const incomingBearing = getRouteBearingAtProgress(options.coordinates, nextProgress);
    if (Math.abs((((incomingBearing - pose.bearing) + 540) % 360) - 180) >= 12) {
      poses.push({ ...pose, bearing: incomingBearing });
    }
  }

  return poses;
}
