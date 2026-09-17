import { useEffect, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useAppStore } from '@/store/useAppStore';
import { createUserLandmark } from '@/utils/createUserLandmark';

/** Kept in sync with useRouteLandmarksLayer, which owns these layers. */
const LANDMARK_LAYER_IDS = ['route-landmarks-icon', 'route-landmarks-label'];

interface RoutePlacement {
  lat: number;
  lon: number;
  progress: number;
}

interface UseLandmarkPlacementParams {
  findNearestRoutePoint: (lat: number, lon: number) => RoutePlacement | null;
  isMapLoaded: boolean;
  isPlacingLandmark: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
}

/**
 * While placement is armed, the next map click drops a landmark exactly where
 * the user clicked — landmarks are not snapped to the route, so a peak or town
 * off to the side can be marked too. The click's route progress is recorded
 * when the route is near enough, which is what orders the sidebar list.
 */
export function useLandmarkPlacement({
  findNearestRoutePoint,
  isMapLoaded,
  isPlacingLandmark,
  mapRef,
}: UseLandmarkPlacementParams) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = isPlacingLandmark ? 'crosshair' : previousCursor;

    return () => { canvas.style.cursor = previousCursor; };
  }, [isMapLoaded, isPlacingLandmark, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      // A click that lands on an existing landmark means "select", not "add".
      // Checking the rendered features rather than event.defaultPrevented keeps
      // this correct no matter which handler MapLibre dispatches first.
      const layers = LANDMARK_LAYER_IDS.filter((layerId) => map.getLayer(layerId));
      if (layers.length > 0 && map.queryRenderedFeatures(event.point, { layers }).length > 0) return;

      const state = useAppStore.getState();
      if (!state.isPlacingLandmark) return;

      const { lat, lng } = event.lngLat;
      const nearest = findNearestRoutePoint(lat, lng);
      const landmark = createUserLandmark({
        lat,
        lon: lng,
        progress: nearest?.progress ?? null,
      });

      state.addLandmark(landmark);
      state.setIsPlacingLandmark(false);
      state.selectLandmark(landmark.id);
    };

    map.on('click', handleMapClick);
    return () => { map.off('click', handleMapClick); };
  }, [findNearestRoutePoint, isMapLoaded, mapRef]);
}
