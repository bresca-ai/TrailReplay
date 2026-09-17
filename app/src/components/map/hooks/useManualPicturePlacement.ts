import { useEffect, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useAppStore } from '@/store/useAppStore';
import type { PendingPicturePlacement, PictureAnnotation, VideoAnnotation } from '@/types';

interface RoutePlacement {
  lat: number;
  lon: number;
  progress: number;
}

interface UseManualPicturePlacementParams {
  addPicture: (picture: PictureAnnotation) => void;
  addVideo: (video: VideoAnnotation) => void;
  findNearestRoutePoint: (lat: number, lon: number) => RoutePlacement | null;
  isMapLoaded: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  pendingPicturePlacements: PendingPicturePlacement[];
  removePendingPicturePlacement: (pictureId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useManualPicturePlacement({
  addPicture,
  addVideo,
  findNearestRoutePoint,
  isMapLoaded,
  mapRef,
  pendingPicturePlacements,
  removePendingPicturePlacement,
  t,
}: UseManualPicturePlacementParams) {
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    const canvas = mapRef.current.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = pendingPicturePlacements.length > 0 ? 'crosshair' : '';

    return () => {
      canvas.style.cursor = previousCursor;
    };
  }, [isMapLoaded, mapRef, pendingPicturePlacements.length]);

  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    const mapInstance = mapRef.current;

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      const pendingPicture = useAppStore.getState().pendingPicturePlacements[0];
      if (!pendingPicture) return;

      const placement = findNearestRoutePoint(event.lngLat.lat, event.lngLat.lng);
      if (!placement) {
        useAppStore.getState().setError(t(pendingPicture.mediaKind === 'video'
          ? 'media.manualPlacementNoRouteVideo'
          : 'media.manualPlacementNoRoute'));
        return;
      }

      // The queue holds both kinds of media, so the click that places them is
      // shared; only what it produces differs.
      if (pendingPicture.mediaKind === 'video') {
        addVideo({
          id: pendingPicture.id,
          file: pendingPicture.file,
          url: pendingPicture.url,
          isPlaceholder: false,
          originalFileName: pendingPicture.file.name,
          lat: placement.lat,
          lon: placement.lon,
          timestamp: pendingPicture.timestamp,
          progress: placement.progress,
          durationSeconds: pendingPicture.durationSeconds,
          placementSource: 'manual',
          title: pendingPicture.title,
          description: pendingPicture.description,
        });
        removePendingPicturePlacement(pendingPicture.id);
        return;
      }

      addPicture({
        id: pendingPicture.id,
        file: pendingPicture.file,
        displayFile: pendingPicture.displayFile,
        url: pendingPicture.url,
        isPlaceholder: false,
        lat: placement.lat,
        lon: placement.lon,
        timestamp: pendingPicture.timestamp,
        progress: placement.progress,
        position: placement.progress,
        placementSource: 'manual',
        title: pendingPicture.title,
        description: pendingPicture.description,
        displayDuration: pendingPicture.displayDuration,
      });
      removePendingPicturePlacement(pendingPicture.id);
    };

    mapInstance.on('click', handleMapClick);
    return () => {
      mapInstance.off('click', handleMapClick);
    };
  }, [addPicture, addVideo, findNearestRoutePoint, isMapLoaded, mapRef, removePendingPicturePlacement, t]);
}
