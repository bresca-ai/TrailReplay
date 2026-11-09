import { useAppStore } from '@/store/useAppStore';
import { buildComputedJourney, buildJourneyDistanceProfile, getJourneyDistanceAtProgress, getJourneyPointAtDistance, getJourneyPointAtProgress, getSegmentAtProgress, segmentAnchorForRouteDistance, uniformJourneyWithCameraTransitions } from '@/utils/journeyUtils';

export const PENDING_MEDIA_DRAG_TYPE = 'application/x-trailreplay-pending-media';

export interface MediaRoutePlacement {
  lat: number;
  lon: number;
  progress: number;
  routeDistance?: number;
  routeSegmentId?: string;
  routeSegmentDistance?: number;
}

/** Resolve a timeline position using the same journey and pace as the marker. */
export function placementAtProgress(progress: number): MediaRoutePlacement | null {
  const state = useAppStore.getState();
  let journey = buildComputedJourney(state.journeySegments, state.tracks);
  if (!journey) return null;
  const hasCamera = journey.segmentTimings.some((segment) => segment.transportMode === 'camera');
  const uniform = state.playback.routeTimingMode === 'uniform';
  if (hasCamera && uniform) journey = uniformJourneyWithCameraTransitions(journey);
  const profile = buildJourneyDistanceProfile(journey.coordinates);
  if (!profile) return null;
  const clamped = Math.max(0, Math.min(1, progress));
  const distance = uniform && !hasCamera ? profile.totalDistance * clamped : getJourneyDistanceAtProgress(clamped, profile, journey.segmentTimings);
  const point = uniform && !hasCamera ? getJourneyPointAtDistance(profile, distance) : getJourneyPointAtProgress(clamped, journey.coordinates, journey.segmentTimings);
  if (!point || point.transportMode === 'camera') return null;
  const timing = journey.segmentTimings.find((segment) => segment.segmentIndex === point.segmentIndex);
  const anchor = timing ? { segmentId: timing.segmentId, segmentDistance: Math.max(0, Math.min(timing.endDistance - timing.startDistance, distance - timing.startDistance)) } : segmentAnchorForRouteDistance(journey.segmentTimings, distance);
  if (!anchor || (!uniform && getSegmentAtProgress(clamped, journey.segmentTimings)?.segment.transportMode === 'camera')) return null;
  return { lat: point.lat, lon: point.lon, progress: clamped, routeDistance: distance, routeSegmentId: anchor.segmentId, routeSegmentDistance: anchor.segmentDistance };
}

/** Commit only selected pending items; all others remain inactive in the queue. */
export function placePendingMedia(ids: string[], placement: MediaRoutePlacement, source: 'manual' | 'timestamp' = 'manual') {
  const store = useAppStore.getState();
  const selected = new Set(ids);
  store.setPendingMediaMapPlacementActive(false);
  for (const item of store.pendingPicturePlacements.filter((entry) => selected.has(entry.id))) {
    const common = { id: item.id, file: item.file, url: item.url, isPlaceholder: false, lat: placement.lat, lon: placement.lon, timestamp: item.timestamp, progress: placement.progress, routeDistance: placement.routeDistance, routeSegmentId: placement.routeSegmentId, routeSegmentDistance: placement.routeSegmentDistance, placementSource: source, title: item.title, description: item.description };
    if (item.mediaKind === 'video') store.addVideo({ ...common, originalFileName: item.file.name, durationSeconds: item.durationSeconds });
    else store.addPicture({ ...common, displayFile: item.displayFile, position: placement.progress, displayDuration: item.displayDuration });
    store.removePendingPicturePlacement(item.id);
  }
}
