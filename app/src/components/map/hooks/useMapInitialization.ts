import { REPLAY_CAMERA_MAX_PITCH } from '@/utils/cameraLimits';
import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { mapGlobalRef } from '@/utils/mapRef';
import { registerAspectProtocol, registerSlopeProtocol } from '@/components/map/terrainProtocols';
import { MAP_STYLE } from '@/components/map/mapStyle';
import { setupTrackSources } from '@/components/map/mapSetup';
import { TRADITIONAL_CHINESE_FONT_FAMILY } from '@/utils/typography';
import { readRetainedTile, retainedTileRequest } from '@/utils/routeTileCache';

let routeCacheProtocolRegistered = false;

interface UseMapInitializationParams {
  mapContainer: React.RefObject<HTMLDivElement | null>;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  onReadyChange?: (isReady: boolean) => void;
  onSetMapLoaded: (isLoaded: boolean) => void;
}

export function useMapInitialization({
  mapContainer,
  mapRef,
  onReadyChange,
  onSetMapLoaded,
}: UseMapInitializationParams) {
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    onReadyChange?.(false);

    registerSlopeProtocol();
    registerAspectProtocol();
    if (!routeCacheProtocolRegistered) {
      maplibregl.addProtocol('trailcache', (request, controller) => readRetainedTile(request.url, controller.signal));
      routeCacheProtocolRegistered = true;
    }
    maplibregl.setWorkerUrl(maplibreWorkerUrl);

    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE as unknown as maplibregl.StyleSpecification,
      center: [0, 0],
      zoom: 2,
      pitch: 0,
      bearing: 0,
      localIdeographFontFamily: TRADITIONAL_CHINESE_FONT_FAMILY,
      maxPitch: REPLAY_CAMERA_MAX_PITCH,
      // MapLibre 5+ ignores the top-level `preserveDrawingBuffer`
      // option; it must be passed as a WebGL context attribute. Without it the
      // map canvas reads back as transparent outside MapLibre's own render
      // callback, so exported frames showed black/stale map areas and
      // successive popup snapshots piled up on top of each other.
      canvasContextAttributes: { preserveDrawingBuffer: true },
      attributionControl: false,
      transformRequest: retainedTileRequest,
      // MapLibre uses the smaller of this ceiling and viewport tile count ×
      // maxTileCacheZoomLevels. Its default of five zoom levels leaves a very
      // small decoded cache on narrow screens, even with a larger ceiling.
      // Keep more recently visited tiles for replay, with a per-source bound.
      maxTileCacheSize: 512,
      maxTileCacheZoomLevels: 20,
      // Preserve the coarser tiles already on screen while close-follow camera
      // zooms request their detailed replacements. This trades a little extra
      // memory/network work for continuous imagery during replay motion.
      cancelPendingTileRequestsWhileZooming: false,
    } as ConstructorParameters<typeof maplibregl.Map>[0]);

    mapGlobalRef.current = mapRef.current;

    mapRef.current.on('load', () => {
      onSetMapLoaded(true);
      onReadyChange?.(true);
      mapRef.current?.addControl(new maplibregl.NavigationControl(), 'top-right');
      mapRef.current?.addControl(new maplibregl.FullscreenControl(), 'top-right');
      if (mapRef.current) {
        setupTrackSources(mapRef.current, '#C1652F');
      }
    });

    return () => {
      onReadyChange?.(false);
      onSetMapLoaded(false);
      mapGlobalRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapContainer, mapRef, onReadyChange, onSetMapLoaded]);
}
