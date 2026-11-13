import type { Map as MapLibreMap } from 'maplibre-gl';
import { BASEMAP_PRESENTATIONS } from '@/components/map/mapStyle';
import { BASEMAP_MAX_TILE_ZOOM_LEVELS, BASEMAP_TILE_COUNT_RATIO } from '@/components/map/basemapTileLod';

import { withStudioForegroundDetail, type TileZoomCalculator } from './studioTileDetail';
import { setExportCanvasResolution } from './exportCanvasResolution';

/** Applies reversible, export-only raster quality settings. */
export function applyStudioMapPresentation(
  map: MapLibreMap,
  options: { highDetail?: boolean; disableRasterFade?: boolean; mapStyle?: string; resolution?: { width: number; height: number } } = {},
): () => void {
  const restores: Array<() => void> = [];
  const layers = map.getStyle()?.layers ?? [];

  // Apply native pixel dimensions for both Standard and Studio.
  if (options.resolution) restores.push(setExportCanvasResolution(map, options.resolution));
  if (options.highDetail) {
    const sourceId = BASEMAP_PRESENTATIONS[options.mapStyle ?? '']?.sourceId;
    const source = sourceId ? map.getSource(sourceId) as { calculateTileZoom?: TileZoomCalculator } | undefined : undefined;
    if (source && sourceId) {
      try {
        const original = source.calculateTileZoom;
        // The public setter schedules a source update. Wrap its calculator
        // before that update runs, then restore the previous calculator later.
        map.setSourceTileLodParams(BASEMAP_MAX_TILE_ZOOM_LEVELS, BASEMAP_TILE_COUNT_RATIO, sourceId);
        if (source.calculateTileZoom) source.calculateTileZoom = withStudioForegroundDetail(source.calculateTileZoom);
        restores.push(() => {
          if (map.getSource(sourceId) !== source) return;
          try {
            map.setSourceTileLodParams(BASEMAP_MAX_TILE_ZOOM_LEVELS, BASEMAP_TILE_COUNT_RATIO, sourceId);
            source.calculateTileZoom = original;
          } catch { /* The style may have changed during export. */ }
        });
      } catch { /* A custom source may not support tile LOD. */ }
    }
  }

  layers.forEach((layer) => {
    if (layer.type !== 'raster' || options.disableRasterFade === false) return;
    try {
      const previous = map.getPaintProperty(layer.id, 'raster-fade-duration');
      map.setPaintProperty(layer.id, 'raster-fade-duration', 0);
      restores.push(() => {
        try {
          map.setPaintProperty(layer.id, 'raster-fade-duration', previous ?? undefined);
        } catch {
          // The layer can disappear if the basemap changes during export.
        }
      });
    } catch {
      // A custom raster layer may reject this paint property.
    }
  });

  return () => {
    restores.reverse().forEach((restore) => restore());
  };
}
