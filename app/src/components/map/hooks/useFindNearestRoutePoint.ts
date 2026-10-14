import { useCallback } from 'react';
import { projectCoordinateToJourney, projectCoordinateToTrack } from '@/utils/routeProjection.ts';
import { useComputedJourney } from '@/hooks/useComputedJourney.ts';
import { useAppStore } from '@/store/useAppStore.ts';

interface RoutePlacement {
  lat: number;
  lon: number;
  progress: number;
}

export function useFindNearestRoutePoint() {
  const playback = useAppStore((state) => state.playback);
  const tracks = useAppStore((state) => state.tracks);

  const {
    activeTrack,
    computedJourney,
  } = useComputedJourney();

  return useCallback((lat: number, lon: number): RoutePlacement | null => {
    if (computedJourney && computedJourney.coordinates.length > 0) {
      return projectCoordinateToJourney(computedJourney, lat, lon, playback.progress);
    }

    const track = activeTrack || tracks[0];
    if (!track || track.points.length === 0) return null;

    return projectCoordinateToTrack(track, lat, lon, playback.progress);
  }, [activeTrack, computedJourney, playback.progress, tracks]);
}
