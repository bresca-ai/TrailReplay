import type { GPXTrack } from '@/types';
import { interpolateTrackPoint } from '@/utils/gpx/interpolateTrackPoint';
import { projectCoordinateToTrack } from '@/utils/routeProjection';
import { RecipeError, type RecipeAnchor } from './types';

/** A track plus where it sits in the replay's timeline. */
export interface RouteLeg {
  track: GPXTrack;
  name: string;
  /** Fraction of the whole replay this leg starts at. */
  progressStart: number;
  /** Fraction of the whole replay this leg occupies. */
  progressShare: number;
  /** Metres from the journey start to this leg's start. 0 when legs are alternatives. */
  journeyStartMeters: number;
}

export interface RouteAnchor {
  lat: number;
  lon: number;
  /**
   * The point on the line itself, which is where the marker will be when the
   * replay reaches this anchor. `lat`/`lon` may sit off the route deliberately,
   * so timing has to be judged against this rather than against those.
   */
  routeLat: number;
  routeLon: number;
  elevation?: number;
  /** Metres along the leg's own track. */
  trackMeters: number;
  /** Metres from the start of the journey. */
  routeDistanceMeters: number;
  /** Fraction of the whole replay. */
  progress: number;
  offRouteMeters?: number;
  leg: RouteLeg;
}

function pickLeg(anchor: RecipeAnchor, legs: RouteLeg[], label: string): RouteLeg {
  if (anchor.track === undefined) return legs[0];

  if (typeof anchor.track === 'number') {
    const leg = legs[anchor.track];
    if (!leg) throw new RecipeError(`${label}: no track at index ${anchor.track}`);
    return leg;
  }

  const wanted = anchor.track.toLowerCase();
  const leg = legs.find((candidate) => candidate.name.toLowerCase() === wanted);
  if (!leg) {
    throw new RecipeError(
      `${label}: no track named "${anchor.track}". Have: ${legs.map((l) => l.name).join(', ')}`,
    );
  }
  return leg;
}

/**
 * A published distance is rounded — a course sold as "15K" measures 14 398 m —
 * so a modest overshoot snaps to the end rather than failing the import. Five
 * percent covers the usual difference between a rounded event distance and a
 * GPX export while still rejecting anchors that are clearly on another route.
 */
function clampToTrack(meters: number, track: GPXTrack, label: string): number {
  const tolerance = Math.max(100, track.totalDistance * 0.05);
  if (meters < -tolerance || meters > track.totalDistance + tolerance) {
    throw new RecipeError(
      `${label}: km ${(meters / 1000).toFixed(2)} is off this route, `
      + `which is ${(track.totalDistance / 1000).toFixed(2)} km long`,
    );
  }
  return Math.max(0, Math.min(track.totalDistance, meters));
}

/**
 * Resolve an anchor to the position the app stores.
 *
 * Distances come from `track.points[].distance`, which the GPX parser already
 * accumulated, so a recipe cannot disagree with the app about where km 6.5 is —
 * the reason this resolution belongs in the app rather than in a build script.
 */
export function anchorOnRoute(
  anchor: RecipeAnchor,
  legs: RouteLeg[],
  label: string,
): RouteAnchor {
  const leg = pickLeg(anchor, legs, label);
  const { track } = leg;

  let trackMeters: number;
  let offRouteMeters: number | undefined;

  if (anchor.km !== undefined) {
    trackMeters = clampToTrack(anchor.km * 1000, track, label);
  } else if (anchor.lat !== undefined && anchor.lon !== undefined) {
    const match = projectCoordinateToTrack(track, anchor.lat, anchor.lon, 0);
    if (!match) throw new RecipeError(`${label}: the track has no points to place this against`);
    trackMeters = match.progress * track.totalDistance;
    offRouteMeters = match.distanceMeters;
  } else if (anchor.progress !== undefined) {
    // A bare progress addresses the whole replay, so it has to come back into
    // the leg's own frame before it means a distance.
    const local = leg.progressShare > 0
      ? (anchor.progress - leg.progressStart) / leg.progressShare
      : 0;
    trackMeters = Math.max(0, Math.min(1, local)) * track.totalDistance;
  } else {
    throw new RecipeError(`${label}: needs one of "km", "lat" + "lon", or "progress"`);
  }

  const point = interpolateTrackPoint(track, trackMeters);
  if (!point) throw new RecipeError(`${label}: the track has no points to place this against`);

  const localFraction = track.totalDistance > 0 ? trackMeters / track.totalDistance : 0;

  return {
    // An authored coordinate stays exactly where it was put; the route match
    // only decides when it appears. A hut 200 m off the trail is still there.
    lat: anchor.lat ?? point.lat,
    lon: anchor.lon ?? point.lon,
    routeLat: point.lat,
    routeLon: point.lon,
    elevation: point.elevation,
    trackMeters,
    routeDistanceMeters: leg.journeyStartMeters + trackMeters,
    progress: Math.max(0, Math.min(1, leg.progressStart + localFraction * leg.progressShare)),
    offRouteMeters,
    leg,
  };
}

/**
 * Lay the tracks out on the replay's timeline.
 *
 * Stitched legs share the timeline by distance unless told otherwise, so a
 * 35 km day is not given the same seconds as an 8 km one — the flat-duration
 * default is what makes a multi-day journey feel wrong.
 */
export function buildLegs(
  tracks: Array<{ track: GPXTrack; name: string; duration?: number }>,
  options: { stitched: boolean; legDuration: 'by-distance' | 'equal' | number; totalDuration: number },
): { legs: RouteLeg[]; durations: number[] } {
  const { stitched, legDuration, totalDuration } = options;

  const totalDistance = tracks.reduce((sum, entry) => sum + entry.track.totalDistance, 0);

  const weights = tracks.map((entry) => {
    if (entry.duration !== undefined) return entry.duration;
    if (typeof legDuration === 'number') return legDuration;
    if (legDuration === 'equal' || totalDistance <= 0) return totalDuration / tracks.length;
    return (entry.track.totalDistance / totalDistance) * totalDuration;
  });

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  const legs: RouteLeg[] = [];
  let elapsedWeight = 0;
  let elapsedMeters = 0;

  for (const [index, entry] of tracks.entries()) {
    legs.push({
      track: entry.track,
      name: entry.name,
      progressStart: stitched ? elapsedWeight / weightTotal : 0,
      progressShare: stitched ? weights[index] / weightTotal : 1,
      // Alternatives each count distance from their own start; legs continue.
      journeyStartMeters: stitched ? elapsedMeters : 0,
    });
    elapsedWeight += weights[index];
    elapsedMeters += entry.track.totalDistance;
  }

  return { legs, durations: weights.map((weight) => Math.round(weight)) };
}
