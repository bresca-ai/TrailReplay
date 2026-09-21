import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  buildComputedJourney,
  progressForRouteDistance,
  routeDistanceForSegmentAnchor,
  segmentAnchorForRouteDistance,
} from '@/utils/journeyUtils';
import { projectCoordinateToJourney } from '@/utils/routeProjection';

/**
 * Keeps route-anchored media and actions in step with the timing mode.
 *
 * A photo's `progress` is computed once, when it is added, using whichever
 * timing mode is active at that moment. Add the photos first and switch to
 * Constant Pace afterwards and a photo keeps its old, point-counted value: it
 * then appears well behind the place it was taken.
 *
 * The recalculation uses the anchor the placement already established: a
 * stable journey segment ID plus the distance from that segment's start. It
 * never looks the photo up on the route again, so out-and-back coordinates
 * remain unambiguous and reordering segments does not move the photo to a
 * different track. Older projects fall back to their journey-wide distance.
 *
 * The effect deliberately does not depend on the picture list it writes to,
 * only on route and timing mode, so one change means exactly one pass.
 */
const TOLERANCE = 1e-6;

export function usePictureRouteSync() {
  const tracks = useAppStore((state) => state.tracks);
  const journeySegments = useAppStore((state) => state.journeySegments);
  const routeTimingMode = useAppStore((state) => state.playback.routeTimingMode);
  const pictureCount = useAppStore((state) => state.pictures.length);
  const videoCount = useAppStore((state) => state.videos.length);
  const annotationCount = useAppStore((state) => state.textAnnotations.length);
  const iconChangeCount = useAppStore((state) => state.iconChanges.length);
  const isExporting = useAppStore((state) => state.isExporting);

  useEffect(() => {
    if (isExporting || (pictureCount === 0 && videoCount === 0 && annotationCount === 0 && iconChangeCount === 0)) {
      return;
    }

    const store = useAppStore.getState();
    const computedJourney = buildComputedJourney(store.journeySegments, store.tracks);
    if (!computedJourney || computedJourney.coordinates.length === 0) {
      return;
    }

    // Clips are anchored the same way as photos and drift the same way when
    // the timing mode changes, so they are re-anchored in the same pass.
    const anchoredMedia: Array<{
      item: {
        id: string;
        progress: number;
        placementSource?: 'gps' | 'timestamp' | 'manual';
        routeDistance?: number;
        routeSegmentId?: string;
        routeSegmentDistance?: number;
      };
      apply: (
        id: string,
        progress: number,
        anchor: { routeDistance: number; routeSegmentId: string; routeSegmentDistance: number },
      ) => void;
    }> = [
      ...store.pictures.map((picture) => ({ item: picture, apply: store.updatePicturePosition })),
      ...store.videos.map((video) => ({ item: video, apply: store.updateVideoPosition })),
    ];

    for (const { item: picture, apply } of anchoredMedia) {
      let routeSegmentId = picture.routeSegmentId;
      let routeSegmentDistance = picture.routeSegmentDistance;
      const hasStableAnchor = routeSegmentId !== undefined && routeSegmentDistance !== undefined;
      if (picture.placementSource === 'manual' || (!hasStableAnchor && picture.routeDistance === undefined)) {
        continue;
      }

      if (!hasStableAnchor && picture.routeDistance !== undefined) {
        const migratedAnchor = segmentAnchorForRouteDistance(
          computedJourney.segmentTimings,
          picture.routeDistance,
        );
        routeSegmentId = migratedAnchor?.segmentId;
        routeSegmentDistance = migratedAnchor?.segmentDistance;
      }
      if (routeSegmentId === undefined || routeSegmentDistance === undefined) {
        continue;
      }

      const anchoredRouteDistance = routeDistanceForSegmentAnchor(
        computedJourney.segmentTimings,
        routeSegmentId,
        routeSegmentDistance,
      );
      if (anchoredRouteDistance === null || anchoredRouteDistance === undefined) {
        continue;
      }

      const progress = progressForRouteDistance(
        computedJourney.coordinates,
        computedJourney.segmentTimings,
        anchoredRouteDistance,
        routeTimingMode,
      );

      if (progress === null) {
        continue;
      }

      const anchorChanged = picture.routeSegmentId !== routeSegmentId ||
        picture.routeSegmentDistance !== routeSegmentDistance ||
        picture.routeDistance === undefined ||
        Math.abs(picture.routeDistance - anchoredRouteDistance) > TOLERANCE;
      if (!anchorChanged && Math.abs(progress - picture.progress) <= TOLERANCE) {
        continue;
      }

      apply(picture.id, progress, {
        routeDistance: anchoredRouteDistance,
        routeSegmentId,
        routeSegmentDistance,
      });
    }

    // Recipe-authored annotations and icon changes are route actions too.
    // Retain a distance anchor so Constant Pace can move them with the marker.
    const retimeAction = (
      item: { id: string; progress: number; routeDistance?: number },
      apply: (progress: number) => void,
    ) => {
      if (item.routeDistance === undefined) return;
      const progress = progressForRouteDistance(
        computedJourney.coordinates,
        computedJourney.segmentTimings,
        item.routeDistance,
        routeTimingMode,
      );
      if (progress !== null && Math.abs(progress - item.progress) > TOLERANCE) apply(progress);
    };

    store.textAnnotations.forEach((annotation) => {
      // Projects saved before route actions had distance anchors still contain
      // the annotation's map coordinate. Resolve it once and persist the
      // missing anchor; otherwise switching to Constant Pace silently leaves
      // the annotation on its old point-counted timeline position.
      if (annotation.routeDistance === undefined) {
        const match = projectCoordinateToJourney(
          computedJourney,
          annotation.lat,
          annotation.lon,
          annotation.progress,
          routeTimingMode,
        );
        if (match?.routeDistance !== undefined) {
          store.updateTextAnnotation(annotation.id, {
            progress: match.progress,
            routeDistance: match.routeDistance,
          });
        }
        return;
      }

      retimeAction(annotation, (progress) => {
        store.updateTextAnnotation(annotation.id, { progress });
      });
    });
    store.iconChanges.forEach((iconChange) => retimeAction(
      iconChange,
      (progress) => store.updateIconChangePosition(iconChange.id, progress),
    ));
  }, [annotationCount, iconChangeCount, isExporting, journeySegments, pictureCount, routeTimingMode, tracks, videoCount]);
}
