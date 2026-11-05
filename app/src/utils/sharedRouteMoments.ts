import type { GPXTrack, JourneySegment, RouteTimingMode, TextAnnotation } from '@/types';
import { buildComputedJourney, progressForRouteDistance, uniformJourneyWithCameraTransitions } from './journeyUtils';
import { projectCoordinateToTrack } from './routeProjection';

/** Matches within 50 m accommodate ordinary GPS variation without matching distant routes. */
export const SHARED_MOMENT_DISTANCE_METERS = 50;

let cache: { annotations: TextAnnotation[]; segments: JourneySegment[]; tracks: GPXTrack[]; mode: RouteTimingMode; result: TextAnnotation[] } | null = null;

/** Expand a single editable moment into timeline appearances, one per route segment. */
export function resolveSharedRouteMoments(annotations: TextAnnotation[], segments: JourneySegment[], tracks: GPXTrack[], mode: RouteTimingMode): TextAnnotation[] {
  if (!annotations.some((annotation) => annotation.showOnMatchingRoutes)) return annotations;
  if (cache && cache.annotations === annotations && cache.segments === segments && cache.tracks === tracks && cache.mode === mode) return cache.result;
  const journey = buildComputedJourney(segments, tracks);
  if (!journey) return annotations;
  const hasTransition = journey.segmentTimings.some((segment) => segment.transportMode === 'camera');
  const adjusted = mode === 'uniform' && hasTransition ? uniformJourneyWithCameraTransitions(journey) : journey;
  const projectionMode = mode === 'uniform' && hasTransition ? 'recorded' : mode;
  const routes = adjusted.segmentTimings.filter((segment) => segment.type === 'track');
  const result = annotations.flatMap((annotation) => {
    if (!annotation.showOnMatchingRoutes) return [annotation];
    const appearances = routes.flatMap((segment) => {
      const track = tracks.find((item) => item.id === segment.trackId);
      if (!track) return [];
      const match = projectCoordinateToTrack(track, annotation.lat, annotation.lon, 0);
      if (!match || match.distanceMeters > SHARED_MOMENT_DISTANCE_METERS) return [];
      const routeDistance = segment.startDistance + match.progress * track.totalDistance;
      const progress = progressForRouteDistance(adjusted.coordinates, [segment], routeDistance, projectionMode);
      return progress === null ? [] : [{ ...annotation, progress }];
    });
    return appearances.length ? appearances : [annotation];
  });
  cache = { annotations, segments, tracks, mode, result };
  return result;
}
