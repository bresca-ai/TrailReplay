import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { AppSettings, TrailStyleSettings } from '@/types';
import { applyBasemapFilter } from '@/components/map/mapFilters';
import {
  BASEMAP_FALLBACK_MAX_ZOOM,
  BASEMAP_PRESENTATIONS,
  STATIC_BASEMAP_LAYER_IDS,
  STATIC_FALLBACK_LAYER_IDS,
} from '@/components/map/mapStyle';

interface UseBaseMapPresentationOptions {
  currentTrackColor: string | null;
  isMapLoaded: boolean;
  mapRef: React.RefObject<maplibregl.Map | null>;
  settings: AppSettings;
  trailStyle: TrailStyleSettings;
}

export function useBaseMapPresentation({
  currentTrackColor,
  isMapLoaded,
  mapRef,
  settings,
  trailStyle,
}: UseBaseMapPresentationOptions) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const presentation = BASEMAP_PRESENTATIONS[settings.mapStyle]
      ?? BASEMAP_PRESENTATIONS.satellite;

    [...STATIC_BASEMAP_LAYER_IDS, ...STATIC_FALLBACK_LAYER_IDS, 'enhanced-hillshade', 'wayback', 'fallback-wayback'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', 'none');
      }
    });

    for (const layerId of [presentation.fallbackLayerId, presentation.layerId]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    }

    if (map.getLayer('ski-pistes')) {
      map.setLayoutProperty('ski-pistes', 'visibility', settings.mapOverlays?.skiPistes ? 'visible' : 'none');
    }

    if (map.getLayer('slope-overlay')) {
      map.setLayoutProperty('slope-overlay', 'visibility', settings.mapOverlays?.slopeOverlay ? 'visible' : 'none');
    }

    if (map.getLayer('aspect-overlay')) {
      map.setLayoutProperty('aspect-overlay', 'visibility', settings.mapOverlays?.aspectOverlay ? 'visible' : 'none');
    }

    const showLabels = ['street', 'topo', 'outdoor'].includes(settings.mapStyle)
      || (!!settings.mapOverlays?.placeLabels && settings.mapStyle !== 'mapbox-streets');
    if (map.getLayer('carto-labels')) {
      map.setLayoutProperty('carto-labels', 'visibility', showLabels ? 'visible' : 'none');
    }
  }, [
    isMapLoaded,
    mapRef,
    settings.mapOverlays?.aspectOverlay,
    settings.mapOverlays?.placeLabels,
    settings.mapOverlays?.skiPistes,
    settings.mapOverlays?.slopeOverlay,
    settings.mapStyle,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !settings.waybackItemURL) return;

    const tileUrl = settings.waybackItemURL
      .replace('{level}', '{z}')
      .replace('{row}', '{y}')
      .replace('{col}', '{x}');
    const isWaybackActive = settings.mapStyle === 'wayback';

    if (map.getLayer('wayback')) map.removeLayer('wayback');
    if (map.getLayer('fallback-wayback')) map.removeLayer('fallback-wayback');
    if (map.getSource('wayback')) map.removeSource('wayback');
    if (map.getSource('fallback-wayback')) map.removeSource('fallback-wayback');

    map.addSource('fallback-wayback', {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: BASEMAP_FALLBACK_MAX_ZOOM,
      attribution: '© Esri',
    });
    map.addSource('wayback', {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      attribution: '© Esri — Source: Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
    });
    map.addLayer(
      {
        id: 'fallback-wayback',
        type: 'raster',
        source: 'fallback-wayback',
        layout: { visibility: isWaybackActive ? 'visible' : 'none' },
        paint: { 'raster-fade-duration': 0 },
      },
      'carto-labels',
    );
    map.addLayer(
      {
        id: 'wayback',
        type: 'raster',
        source: 'wayback',
        layout: { visibility: isWaybackActive ? 'visible' : 'none' },
        paint: { 'raster-fade-duration': 250 },
      },
      'carto-labels'
    );
  }, [isMapLoaded, mapRef, settings.mapStyle, settings.waybackItemURL]);

  // Declared after the wayback effect so it also paints the layers that effect
  // re-creates: swapping the wayback date rebuilds them with default paint.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    applyBasemapFilter(map, settings.mapFilter ?? 'none');
  }, [isMapLoaded, mapRef, settings.mapFilter, settings.mapStyle, settings.waybackItemURL]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const color = currentTrackColor || trailStyle.trailColor;

    if (map.getLayer('trail-line')) {
      map.setPaintProperty('trail-line', 'line-color', ['coalesce', ['get', 'color'], color]);
    }
    if (map.getLayer('trail-completed')) {
      map.setPaintProperty('trail-completed', 'line-color', ['coalesce', ['get', 'color'], color]);
    }
  }, [currentTrackColor, isMapLoaded, mapRef, trailStyle.colorMode, trailStyle.trailColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (map.getLayer('trail-line')) {
      map.setPaintProperty('trail-line', 'line-opacity', trailStyle.ghostTrailOpacity);
    }
  }, [isMapLoaded, mapRef, trailStyle.ghostTrailOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // The moving label is rendered inside the marker DOM overlay so it shares
    // the marker's transform and cannot trail a frame behind GeoJSON updates.
    if (map.getLayer('main-track-label')) {
      map.setLayoutProperty('main-track-label', 'visibility', 'none');
    }
  }, [isMapLoaded, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (settings.show3DTerrain) {
      if (map.getSource('terrain-dem')) {
        map.setTerrain({
          source: 'terrain-dem',
          exaggeration: 1.5
        });
      }
      return;
    }

    map.setTerrain(null);
  }, [isMapLoaded, mapRef, settings.show3DTerrain]);
}
