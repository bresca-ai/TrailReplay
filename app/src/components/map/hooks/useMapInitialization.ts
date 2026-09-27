import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { mapGlobalRef } from '@/utils/mapRef';
import { registerAspectProtocol, registerSlopeProtocol } from '@/components/map/terrainProtocols';
import { MAP_STYLE } from '@/components/map/mapStyle';
import { setupTrackSources } from '@/components/map/mapSetup';

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
    maplibregl.setWorkerUrl(maplibreWorkerUrl);

    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE as unknown as maplibregl.StyleSpecification,
      center: [0, 0],
      zoom: 2,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      // MapLibre 5+ ignores the top-level `preserveDrawingBuffer`
      // option; it must be passed as a WebGL context attribute. Without it the
      // map canvas reads back as transparent outside MapLibre's own render
      // callback, so exported frames showed black/stale map areas and
      // successive popup snapshots piled up on top of each other.
      canvasContextAttributes: { preserveDrawingBuffer: true },
      attributionControl: false,
      // Keep more tiles in memory than the viewport-based default so the tiles
      // warmed during the `preloading` phase (and along the route) aren't evicted
      // mid-flythrough, which would re-introduce white tiles. See issue #63.
      maxTileCacheSize: 2000,
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
      mapGlobalRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapContainer, mapRef, onReadyChange, onSetMapLoaded]);
}
