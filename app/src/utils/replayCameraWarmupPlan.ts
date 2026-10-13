import { getCinematicCameraPose, type PreparedCinematicKeyframe } from '@/utils/cinematicCameraPlan';
import {
  getOpeningPreloadProgresses,
  getPlaybackCameraPose,
  getRouteBearingAtProgress,
  type ReplayCameraMode,
  type ReplayCameraPose,
} from '@/utils/replayCameraPlan';

export type WarmupCameraMode = ReplayCameraMode | 'cinematic';

interface ReplayPoseOptions {
  cameraMode: WarmupCameraMode;
  cinematicKeyframes?: PreparedCinematicKeyframe[];
  coordinates: number[][];
  elevationData: Array<{ elevation: number; progress?: number }>;
  followBehindZoomLevel: number;
  progress: number;
}

const DEFAULT_MAX_TRANSITION_SAMPLES = 24;
const MAX_ZOOM_DELTA_PER_SAMPLE = 0.75;
const MAX_BEARING_DELTA_PER_SAMPLE = 30;
const MAX_TILE_DISTANCE_PER_SAMPLE = 0.75;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  return (((toDeg - fromDeg) % 360) + 540) % 360 - 180;
}

function longitudeDelta(fromDeg: number, toDeg: number): number {
  return shortestAngleDelta(fromDeg, toDeg);
}

function mercatorY(latitude: number): number {
  const radians = clamp(latitude, -85.051129, 85.051129) * Math.PI / 180;
  return (1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2;
}

function inverseMercatorY(y: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - (2 * y)))) * 180 / Math.PI;
}

function normalizedLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function deduplicateCameraPoses(poses: Array<ReplayCameraPose | null>): ReplayCameraPose[] {
  const seen = new Set<string>();
  return poses.filter((pose): pose is ReplayCameraPose => {
    if (!pose) return false;
    const key = [
      pose.center[0].toFixed(5),
      pose.center[1].toFixed(5),
      pose.zoom.toFixed(2),
      pose.pitch.toFixed(1),
      pose.bearing.toFixed(1),
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The same unsmoothed target pose the replay camera uses for a given mode. */
export function getReplayWarmupPose(options: ReplayPoseOptions): ReplayCameraPose | null {
  if (options.cameraMode === 'cinematic') {
    return getCinematicCameraPose({
      keyframes: options.cinematicKeyframes ?? [],
      coordinates: options.coordinates,
      progress: options.progress,
      routeHeadingDeg: getRouteBearingAtProgress(options.coordinates, options.progress),
    }) ?? getPlaybackCameraPose({
      cameraMode: 'follow-behind',
      coordinates: options.coordinates,
      elevationData: options.elevationData,
      followBehindZoomLevel: options.followBehindZoomLevel,
      progress: options.progress,
    });
  }

  return getPlaybackCameraPose({
    cameraMode: options.cameraMode,
    coordinates: options.coordinates,
    elevationData: options.elevationData,
    followBehindZoomLevel: options.followBehindZoomLevel,
    progress: options.progress,
  });
}

/**
 * Samples a MapLibre camera transition densely enough to request each band of
 * tiles it crosses. The cap matters: these poses are visited by a real map and
 * therefore consume decoded-tile and GPU cache, not only the HTTP cache.
 */
export function sampleCameraTransition(
  from: ReplayCameraPose,
  to: ReplayCameraPose,
  maxSamples = DEFAULT_MAX_TRANSITION_SAMPLES,
): ReplayCameraPose[] {
  const boundedMax = Math.max(2, Math.floor(maxSamples));
  const zoomSteps = Math.ceil(Math.abs(to.zoom - from.zoom) / MAX_ZOOM_DELTA_PER_SAMPLE);
  const bearingDelta = shortestAngleDelta(from.bearing, to.bearing);
  const bearingSteps = Math.ceil(Math.abs(bearingDelta) / MAX_BEARING_DELTA_PER_SAMPLE);

  // Approximate how many tiles the centre crosses at the widest zoom in the
  // move. This catches long pans even when start/end happen to share a zoom.
  const referenceZoom = Math.min(from.zoom, to.zoom);
  const worldTiles = 2 ** clamp(referenceZoom, 0, 20);
  const xDistance = Math.abs(longitudeDelta(from.center[0], to.center[0])) / 360;
  const yDistance = Math.abs(mercatorY(from.center[1]) - mercatorY(to.center[1]));
  const tileSteps = Math.ceil(
    Math.hypot(xDistance, yDistance) * worldTiles / MAX_TILE_DISTANCE_PER_SAMPLE,
  );
  const segmentCount = clamp(Math.max(1, zoomSteps, bearingSteps, tileSteps), 1, boundedMax - 1);
  const fromY = mercatorY(from.center[1]);
  const toY = mercatorY(to.center[1]);
  const lonDelta = longitudeDelta(from.center[0], to.center[0]);

  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    if (index === 0) return from;
    if (index === segmentCount) return to;
    const progress = index / segmentCount;
    return {
      center: [
        normalizedLongitude(from.center[0] + lonDelta * progress),
        inverseMercatorY(fromY + (toY - fromY) * progress),
      ],
      zoom: from.zoom + (to.zoom - from.zoom) * progress,
      pitch: from.pitch + (to.pitch - from.pitch) * progress,
      bearing: from.bearing + bearingDelta * progress,
    };
  });
}

export function getOpeningReplayWarmupPoses({
  totalDurationMs,
  windowMs,
  sampleCount,
  ...options
}: Omit<ReplayPoseOptions, 'progress'> & {
  totalDurationMs: number;
  windowMs: number;
  sampleCount: number;
}): ReplayCameraPose[] {
  return deduplicateCameraPoses(
    getOpeningPreloadProgresses(totalDurationMs, windowMs, sampleCount)
      .map((progress) => getReplayWarmupPose({ ...options, progress })),
  );
}

export function getTransitionWarmupPoses({
  introFrom,
  introTo,
  outroFrom,
  outroTo,
  maxSamplesPerTransition,
}: {
  introFrom: ReplayCameraPose;
  introTo: ReplayCameraPose | null;
  outroFrom: ReplayCameraPose | null;
  outroTo: ReplayCameraPose | null;
  maxSamplesPerTransition?: number;
}): { intro: ReplayCameraPose[]; outro: ReplayCameraPose[] } {
  return {
    intro: introTo
      ? deduplicateCameraPoses(sampleCameraTransition(introFrom, introTo, maxSamplesPerTransition))
      : [],
    outro: outroFrom && outroTo
      ? deduplicateCameraPoses(sampleCameraTransition(outroFrom, outroTo, maxSamplesPerTransition))
      : [],
  };
}
