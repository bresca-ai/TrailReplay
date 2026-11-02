import type { GPXTrack, RouteTimingMode } from '@/types';
import type { ComputedJourney, SegmentTiming } from '@/utils/journeyUtils';
import { calculateDistance, progressForRouteDistance } from '@/utils/journeyUtils';

export interface RouteMatch {
  progress: number;
  lat: number;
  lon: number;
  distanceMeters: number;
  /**
   * Where the match sits along the journey, in metres from its start. Absent
   * when the match was made against loose tracks rather than a journey.
   */
  routeDistance?: number;
  routeSegmentId?: string;
  routeSegmentDistance?: number;
}

const METERS_PER_DEGREE_LAT = 111_320;

interface ProjectionCandidate {
  fraction: number;
  lat: number;
  lon: number;
  distanceMeters: number;
}

function toMeters(lat: number, lon: number, latitudeReference: number) {
  const cosLatitude = Math.cos((latitudeReference * Math.PI) / 180);
  return {
    x: lon * METERS_PER_DEGREE_LAT * cosLatitude,
    y: lat * METERS_PER_DEGREE_LAT,
  };
}

function projectOntoSegment(
  targetLat: number,
  targetLon: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): ProjectionCandidate {
  const latitudeReference = (targetLat + startLat + endLat) / 3;
  const target = toMeters(targetLat, targetLon, latitudeReference);
  const start = toMeters(startLat, startLon, latitudeReference);
  const end = toMeters(endLat, endLon, latitudeReference);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared <= 0) {
    return {
      fraction: 0,
      lat: startLat,
      lon: startLon,
      distanceMeters: calculateDistance(targetLat, targetLon, startLat, startLon) * 1000,
    };
  }

  const projectedFraction = ((target.x - start.x) * dx + (target.y - start.y) * dy) / segmentLengthSquared;
  const fraction = Math.max(0, Math.min(1, projectedFraction));
  const projectedX = start.x + dx * fraction;
  const projectedY = start.y + dy * fraction;

  const projectedLat = projectedY / METERS_PER_DEGREE_LAT;
  const projectedLon = projectedX / (METERS_PER_DEGREE_LAT * Math.cos((latitudeReference * Math.PI) / 180));

  return {
    fraction,
    lat: projectedLat,
    lon: projectedLon,
    distanceMeters: calculateDistance(targetLat, targetLon, projectedLat, projectedLon) * 1000,
  };
}

function matchSinglePoint(
  targetLat: number,
  targetLon: number,
  pointLat: number,
  pointLon: number,
  progress: number,
): RouteMatch {
  return {
    lat: pointLat,
    lon: pointLon,
    progress,
    distanceMeters: calculateDistance(targetLat, targetLon, pointLat, pointLon) * 1000,
  };
}

export function projectCoordinateToTrack(
  track: GPXTrack,
  targetLat: number,
  targetLon: number,
  fallbackProgress: number,
): RouteMatch | null {
  if (track.points.length === 0) {
    return null;
  }

  if (track.points.length === 1) {
    return matchSinglePoint(
      targetLat,
      targetLon,
      track.points[0].lat,
      track.points[0].lon,
      fallbackProgress,
    );
  }

  let bestMatch: RouteMatch | null = null;

  for (let index = 0; index < track.points.length - 1; index += 1) {
    const start = track.points[index];
    const end = track.points[index + 1];
    const projection = projectOntoSegment(
      targetLat,
      targetLon,
      start.lat,
      start.lon,
      end.lat,
      end.lon,
    );

    const projectedDistance = start.distance + (end.distance - start.distance) * projection.fraction;
    const progress = track.totalDistance > 0 ? projectedDistance / track.totalDistance : fallbackProgress;

    if (!bestMatch || projection.distanceMeters < bestMatch.distanceMeters) {
      bestMatch = {
        lat: projection.lat,
        lon: projection.lon,
        progress: Math.max(0, Math.min(1, progress)),
        distanceMeters: projection.distanceMeters,
      };
    }
  }

  return bestMatch;
}

export function projectCoordinateToTracks(
  tracks: GPXTrack[],
  targetLat: number,
  targetLon: number,
  fallbackProgress: number,
): RouteMatch | null {
  let bestMatch: RouteMatch | null = null;

  for (const track of tracks) {
    const candidate = projectCoordinateToTrack(track, targetLat, targetLon, fallbackProgress);
    if (!candidate) {
      continue;
    }

    if (!bestMatch || candidate.distanceMeters < bestMatch.distanceMeters) {
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Distance from the journey start for a point between two coordinates.
 *
 * Track coordinates carry the distance from their own track's start, so the
 * segment's offset within the journey has to be added back on.
 */
function routeAnchorForJourneySegment(
  segmentTiming: SegmentTiming,
  coordinates: ComputedJourney['coordinates'],
  index: number,
  fraction: number,
): { routeDistance: number; routeSegmentDistance: number } | null {
  const start = coordinates[index];
  const end = coordinates[index + 1];
  if (!start || !end) return null;

  const localDistance = start.distance + (end.distance - start.distance) * fraction;
  return {
    routeDistance: segmentTiming.startDistance + localDistance,
    routeSegmentDistance: localDistance,
  };
}

function progressForJourneySegment(segmentTiming: SegmentTiming, startCoordIndex: number, exactIndex: number) {
  const segmentCoordCount = Math.max(segmentTiming.endCoordIndex - segmentTiming.startCoordIndex, 1);
  const localProgress = (exactIndex - startCoordIndex) / segmentCoordCount;
  return segmentTiming.progressStartRatio +
    localProgress * (segmentTiming.progressEndRatio - segmentTiming.progressStartRatio);
}

export function projectCoordinateToJourney(
  computedJourney: ComputedJourney,
  targetLat: number,
  targetLon: number,
  fallbackProgress: number,
  /** Bei 'uniform' (Constant Pace) laeuft der Ruecklauf nach Entfernung. */
  routeTimingMode: RouteTimingMode = 'recorded',
): RouteMatch | null {
  const { coordinates, segmentTimings } = computedJourney;

  if (coordinates.length === 0) {
    return null;
  }

  if (coordinates.length === 1) {
    const timing = segmentTimings[0];
    const segmentProgress = timing?.progressStartRatio ?? fallbackProgress;
    const match = matchSinglePoint(
      targetLat,
      targetLon,
      coordinates[0].lat,
      coordinates[0].lon,
      segmentProgress,
    );
    return timing
      ? {
          ...match,
          routeDistance: timing.startDistance + coordinates[0].distance,
          routeSegmentId: timing.segmentId,
          routeSegmentDistance: coordinates[0].distance,
        }
      : match;
  }

  let bestMatch: RouteMatch | null = null;

  for (const segmentTiming of segmentTimings) {
    if (segmentTiming.transportMode === 'camera') continue;
    if (segmentTiming.endCoordIndex <= segmentTiming.startCoordIndex) {
      const point = coordinates[segmentTiming.startCoordIndex];
      if (!point) {
        continue;
      }

      const progress = segmentTiming.progressStartRatio;
      const candidate = matchSinglePoint(targetLat, targetLon, point.lat, point.lon, progress);
      if (!bestMatch || candidate.distanceMeters < bestMatch.distanceMeters) {
        bestMatch = {
          ...candidate,
          routeDistance: segmentTiming.startDistance + point.distance,
          routeSegmentId: segmentTiming.segmentId,
          routeSegmentDistance: point.distance,
        };
      }
      continue;
    }

    for (let index = segmentTiming.startCoordIndex; index < segmentTiming.endCoordIndex; index += 1) {
      const start = coordinates[index];
      const end = coordinates[index + 1];
      if (!start || !end) {
        continue;
      }

      const projection = projectOntoSegment(
        targetLat,
        targetLon,
        start.lat,
        start.lon,
        end.lat,
        end.lon,
      );
      if (bestMatch && projection.distanceMeters >= bestMatch.distanceMeters) {
        continue;
      }

      const exactIndex = index + projection.fraction;
      const routeAnchor = routeAnchorForJourneySegment(
        segmentTiming,
        coordinates,
        index,
        projection.fraction,
      );
      // Constant Pace advances by distance travelled. A slow climb records far
      // more points per kilometre than a fast descent, so counting points puts
      // a summit much later than counting kilometres - which is why photos
      // showed up well behind the place they were taken.
      const progress = routeAnchor !== null
        ? progressForRouteDistance(coordinates, segmentTimings, routeAnchor.routeDistance, routeTimingMode)
          ?? progressForJourneySegment(segmentTiming, segmentTiming.startCoordIndex, exactIndex)
        : progressForJourneySegment(segmentTiming, segmentTiming.startCoordIndex, exactIndex);

      bestMatch = {
        lat: projection.lat,
        lon: projection.lon,
        progress: Math.max(0, Math.min(1, progress)),
        distanceMeters: projection.distanceMeters,
        routeDistance: routeAnchor?.routeDistance,
        routeSegmentId: segmentTiming.segmentId,
        routeSegmentDistance: routeAnchor?.routeSegmentDistance,
      };
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  const firstPoint = coordinates[0];
  return matchSinglePoint(targetLat, targetLon, firstPoint.lat, firstPoint.lon, fallbackProgress);
}
