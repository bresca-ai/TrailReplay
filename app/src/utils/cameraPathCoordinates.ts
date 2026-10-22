import type { GPXTrack, RouteTimingMode } from '@/types';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import {
  getJourneyPointAtDistance,
  getJourneyPointAtProgress,
  type ComputedJourney,
  type JourneyDistanceProfile,
} from '@/utils/journeyUtils';

export const CAMERA_PATH_SAMPLE_COUNT = 601;

/** Replay-time camera path used by preview and export, shared with terrain review. */
export function buildCameraPathCoordinates(
  computedJourney: ComputedJourney | null,
  journeyDistanceProfile: JourneyDistanceProfile | null,
  activeTrack: GPXTrack | undefined,
  routeTimingMode: RouteTimingMode,
): number[][] {
  if (!computedJourney) {
    if (!activeTrack || activeTrack.points.length === 0) return [];
    return Array.from({ length: CAMERA_PATH_SAMPLE_COUNT }, (_, index) => {
      const point = interpolateTrackPoint(activeTrack, activeTrack.totalDistance * index / (CAMERA_PATH_SAMPLE_COUNT - 1));
      return point ? [point.lon, point.lat] : [];
    }).filter((coordinate) => coordinate.length === 2);
  }

  return Array.from({ length: CAMERA_PATH_SAMPLE_COUNT }, (_, index) => {
    const progress = index / (CAMERA_PATH_SAMPLE_COUNT - 1);
    const point = routeTimingMode === 'uniform' && journeyDistanceProfile
      ? getJourneyPointAtDistance(journeyDistanceProfile, journeyDistanceProfile.totalDistance * progress)
      : getJourneyPointAtProgress(progress, computedJourney.coordinates, computedJourney.segmentTimings);
    return point ? [point.lon, point.lat] : [];
  }).filter((coordinate) => coordinate.length === 2);
}
