import { useEffect, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useAppStore } from '@/store/useAppStore';
import type { PendingPicturePlacement, PictureAnnotation, VideoAnnotation } from '@/types';
import { placePendingMedia } from '@/utils/pendingMediaPlacement';
import { useFindNearestRoutePoint } from '@/components/map/hooks/useFindNearestRoutePoint.ts';

interface UseManualPicturePlacementParams {
  addPicture: (picture: PictureAnnotation) => void;
  addVideo: (video: VideoAnnotation) => void;
  isMapLoaded: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  pendingPicturePlacements: PendingPicturePlacement[];
  removePendingPicturePlacement: (pictureId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useManualPicturePlacement({
  isMapLoaded,
  mapRef,
  pendingPicturePlacements,
  t,
}: UseManualPicturePlacementParams) {
  const findNearestRoutePoint = useFindNearestRoutePoint();
  const mapPlacementActive = useAppStore((state) => state.pendingMediaMapPlacementActive);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    const canvas = mapRef.current.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = mapPlacementActive && pendingPicturePlacements.length > 0 ? 'crosshair' : '';

    return () => {
      canvas.style.cursor = previousCursor;
    };
  }, [isMapLoaded, mapRef, mapPlacementActive, pendingPicturePlacements.length]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    const mapInstance = mapRef.current;

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      const { pendingPicturePlacements: pending, selectedPendingMediaIds: ids } = useAppStore.getState();
      if (!useAppStore.getState().pendingMediaMapPlacementActive || !pending.length || !ids.length) return;
      const placement = findNearestRoutePoint(event.lngLat.lat, event.lngLat.lng);
      if (!placement) {
        useAppStore.getState().setError(t('media.manualPlacementNoRoute'));
        return;
      }
      placePendingMedia(ids, placement);
      useAppStore.getState().setPendingMediaMapPlacementActive(false);

    };

    mapInstance.on('click', handleMapClick);
    return () => {
      mapInstance.off('click', handleMapClick);
    };
  }, [findNearestRoutePoint, isMapLoaded, mapRef, t]);
}
