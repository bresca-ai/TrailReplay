import type { GPXTrack, RouteTimingMode } from '@/types';
import { buildJourneyDistanceProfile, getJourneyPointAtDistance, progressForRouteDistance, type ComputedJourney } from '@/utils/journeyUtils';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';

/** Resolve a stable route-distance anchor to the map and the playback timeline. */
export function annotationPlacementAtDistance(distance: number, journey: ComputedJourney | null, track: GPXTrack | null, timing: RouteTimingMode) {
  if (!Number.isFinite(distance)) return null;
  if (journey) {
    const profile = buildJourneyDistanceProfile(journey.coordinates);
    if (!profile || !journey.coordinates.length) return null;
    const routeDistance = Math.max(0, Math.min(profile.totalDistance, distance));
    const point = getJourneyPointAtDistance(profile, routeDistance);
    const progress = progressForRouteDistance(journey.coordinates, journey.segmentTimings, routeDistance, timing);
    if (!point || progress === null) return null;
    return { routeDistance, progress, lat: point.lat, lon: point.lon, elevation: point.elevation };
  }
  if (!track || !track.points.length) return null;
  const routeDistance = Math.max(0, Math.min(track.totalDistance, distance));
  const point = interpolateTrackPoint(track, routeDistance);
  if (!point) return null;
  return { routeDistance, progress: track.totalDistance > 0 ? routeDistance / track.totalDistance : 0, lat: point.lat, lon: point.lon, elevation: point.elevation };
}
