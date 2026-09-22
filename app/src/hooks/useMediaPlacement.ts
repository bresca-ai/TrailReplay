import { useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { buildComputedJourney } from '@/utils/journeyUtils';
import { findTimestampPlacement } from '@/utils/photoTimelinePlacement';
import type { TimestampPlacementFailureReason, TimestampPlacementMatch } from '@/utils/photoTimelinePlacement';
import type { RouteMatch } from '@/utils/routeProjection';
import { projectCoordinateToJourney, projectCoordinateToTracks } from '@/utils/routeProjection';

/**
 * Where a piece of media belongs on the route.
 *
 * Photos and clips answer that question the same way — GPS first, capture time
 * second — so both go through this one implementation. Anything that placed
 * media by re-deriving the route maths on its own would drift away from the
 * placement the rest of the app uses.
 */
export function useMediaPlacement() {
  const tracks = useAppStore((state) => state.tracks);
  const activeTrackId = useAppStore((state) => state.activeTrackId);
  const journeySegments = useAppStore((state) => state.journeySegments);
  const playback = useAppStore((state) => state.playback);
  // Every file in an import batch uses the same geometry. Rebuild only when
  // routes change, rather than once for GPS and again for each timestamp.
  const computedJourney = useMemo(
    () => buildComputedJourney(journeySegments, tracks),
    [journeySegments, tracks],
  );

  const findPositionOnRoute = useCallback((lat: number, lon: number): RouteMatch | null => {

    if (computedJourney && computedJourney.coordinates.length > 0) {
      return projectCoordinateToJourney(computedJourney, lat, lon, playback.progress, playback.routeTimingMode);
    }

    const candidateTracks = activeTrackId
      ? [
          ...tracks.filter((track) => track.id === activeTrackId),
          ...tracks.filter((track) => track.id !== activeTrackId),
        ]
      : tracks;

    if (candidateTracks.length === 0) {
      return null;
    }

    return projectCoordinateToTracks(candidateTracks, lat, lon, playback.progress);
  }, [activeTrackId, computedJourney, playback.progress, playback.routeTimingMode, tracks]);

  const findPositionAtTime = useCallback((timestamp: Date | undefined): {
    match: TimestampPlacementMatch | null;
    reason: TimestampPlacementFailureReason | null;
  } => {
    return findTimestampPlacement({
      timestamp,
      tracks,
      journeySegments,
      computedJourney,
      activeTrackId,
      routeTimingMode: playback.routeTimingMode,
    });
  }, [activeTrackId, computedJourney, journeySegments, playback.routeTimingMode, tracks]);

  return { findPositionOnRoute, findPositionAtTime };
}
