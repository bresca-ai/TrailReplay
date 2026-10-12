import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useComputedJourney } from '@/hooks/useComputedJourney';
import { analyzeRouteLandmarks } from '@/utils/routeLandmarks';
import { resolveRouteLandmarks } from '@/utils/resolveRouteLandmarks';
import type { RouteLandmark } from '@/types/landmarks';

/**
 * Every landmark the route currently has, before the replay's progress-based
 * visibility filter. The map narrows this down per frame; the sidebar editor
 * needs the stable full set so its list does not churn during playback.
 *
 * Hiding only ever removes derived landmarks. A user landmark is removed
 * outright, and an adopted one deliberately reuses the derived id, so it must
 * survive the hidden filter that suppresses the original.
 */
export function useAllRouteLandmarks(): RouteLandmark[] {
  const userLandmarks = useAppStore((state) => state.userLandmarks);
  const hiddenLandmarkIds = useAppStore((state) => state.hiddenLandmarkIds);
  const showAutomaticLandmarks = useAppStore((state) => state.showAutomaticLandmarks);
  const enrichedLandmarks = useAppStore((state) => state.enrichedLandmarks);
  const nearbyPlaceTypes = useAppStore((state) => state.nearbyPlaceTypes);
  const { computedJourney, activeTrack } = useComputedJourney();

  const automatic = useMemo(() => showAutomaticLandmarks
    ? analyzeRouteLandmarks(computedJourney?.coordinates ?? activeTrack?.points ?? [])
    : [], [activeTrack?.points, computedJourney?.coordinates, showAutomaticLandmarks]);

  return useMemo(() => {
    const hidden = new Set(hiddenLandmarkIds);
    const visibleNearbyPlaces = nearbyPlaceTypes === null
      ? enrichedLandmarks
      : enrichedLandmarks.filter((landmark) => nearbyPlaceTypes.includes(landmark.type));
    const derived = [
      ...(showAutomaticLandmarks ? automatic : []),
      ...visibleNearbyPlaces,
    ].filter((landmark) => !hidden.has(landmark.id));

    return resolveRouteLandmarks([...derived, ...userLandmarks]);
  }, [automatic, enrichedLandmarks, hiddenLandmarkIds, nearbyPlaceTypes, showAutomaticLandmarks, userLandmarks]);
}
