import type { GPXTrack, RouteTimingMode, TextAnnotation } from '@/types';
import { progressForRouteDistance, type ComputedJourney } from '@/utils/journeyUtils';
import { projectCoordinateToTrack } from '@/utils/routeProjection';
import { createId } from '@/utils/id';

export type WaypointPresentation = 'map-card' | 'side-panel';

/** Place imported waypoints on their journey leg, retaining their original coordinates. */
export function importWaypoints(
  tracks: GPXTrack[], journeyTracks: GPXTrack[], journey: ComputedJourney | null,
  presentation: WaypointPresentation, timingMode: RouteTimingMode,
  groups: Map<string, string> = new Map(),
): TextAnnotation[] {
  if (!journey) return [];
  const result: TextAnnotation[] = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    const primaryId = groups.get(track.id) ?? track.id;
    const anchorTrack = journeyTracks.find((item) => item.id === primaryId);
    const timing = journey.segmentTimings.find((entry) => entry.type === 'track' && entry.trackId === primaryId);
    if (!timing || !anchorTrack) continue;
    for (const waypoint of track.waypoints ?? []) {
      // Alternatives can contain copies of the same waypoint. Separate journey
      // legs, however, are allowed to visit the same place independently.
      const key = `${primaryId}:${waypoint.lat.toFixed(5)}:${waypoint.lon.toFixed(5)}:${waypoint.name.toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      const match = projectCoordinateToTrack(anchorTrack, waypoint.lat, waypoint.lon, 0);
      if (!match) continue;
      seen.add(key);
      const routeDistance = timing.startDistance + match.progress * (timing.endDistance - timing.startDistance);
      result.push({
        id: createId('waypoint'), lat: waypoint.lat, lon: waypoint.lon, title: waypoint.name,
        ...(waypoint.description ? { subtitle: waypoint.description } : {}),
        ...(waypoint.elevation !== undefined ? { elevation: waypoint.elevation } : {}),
        progress: progressForRouteDistance(journey.coordinates, journey.segmentTimings, routeDistance, timingMode) ?? 0,
        routeDistance, color: '#f3b133', displayDuration: 4000, presentation,
        ...(presentation === 'side-panel' ? { logo: 'map:pin' } : {}),
      });
    }
  }
  return result;
}
