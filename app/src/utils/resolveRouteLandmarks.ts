import type { RouteLandmark } from '@/types/landmarks';
import { calculateDistance } from '@/utils/journeyUtils';
import { MAX_NEARBY_PLACES_TOTAL } from '@/utils/landmarkLookup';

const SOURCE_WEIGHT = { user: 4, media: 3, enriched: 2, automatic: 1 } as const;

function score(landmark: RouteLandmark, activeId?: string | null) {
  return (landmark.id === activeId ? 10_000 : 0) + landmark.importance * 100 + SOURCE_WEIGHT[landmark.source] * 10 + (landmark.type === 'finish' ? 45 : 0) + (landmark.type === 'highest-point' ? 35 : 0);
}

export function resolveRouteLandmarks(landmarks: RouteLandmark[], activeId?: string | null): RouteLandmark[] {
  const sorted = [...landmarks].sort((a, b) => score(b, activeId) - score(a, activeId));
  const selected: RouteLandmark[] = [];
  for (const landmark of sorted) {
    const duplicate = selected.find((entry) => calculateDistance(entry.lat, entry.lon, landmark.lat, landmark.lon) * 1000 < 80);
    if (duplicate) continue;
    const corridorConflict = landmark.importance < 5 && selected.find((entry) => Math.abs((entry.routeDistanceMeters ?? -Infinity) - (landmark.routeDistanceMeters ?? Infinity)) < 250);
    if (corridorConflict) continue;
    selected.push(landmark);
    if (selected.length === MAX_NEARBY_PLACES_TOTAL) break;
  }
  return selected.sort((a, b) => (a.routeDistanceMeters ?? 0) - (b.routeDistanceMeters ?? 0));
}
