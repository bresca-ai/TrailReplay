import type { Map as MapLibreMap } from 'maplibre-gl';
import { BASEMAP_PRESENTATIONS } from '@/components/map/mapStyle';
import { BASEMAP_MAX_TILE_ZOOM_LEVELS, BASEMAP_TILE_COUNT_RATIO } from '@/components/map/basemapTileLod';

// Allow more high-detail imagery at pitched camera angles without asking for
// full-resolution tiles all the way to the horizon.
export const STUDIO_MAX_TILE_ZOOM_LEVELS = 3;
export const STUDIO_TILE_COUNT_RATIO = 4;

/** Applies reversible, export-only raster quality settings. */
export function applyStudioMapPresentation(
  map: MapLibreMap,
  options: { highDetail?: boolean; mapStyle?: string } = {},
): () => void {
  const restores: Array<() => void> = [];
  const layers = map.getStyle()?.layers ?? [];

  if (options.highDetail) {
    const sourceId = BASEMAP_PRESENTATIONS[options.mapStyle ?? '']?.sourceId;
    if (sourceId && map.getSource(sourceId)) {
      try {
        map.setSourceTileLodParams(STUDIO_MAX_TILE_ZOOM_LEVELS, STUDIO_TILE_COUNT_RATIO, sourceId);
        restores.push(() => {
          try {
            if (map.getSource(sourceId)) map.setSourceTileLodParams(BASEMAP_MAX_TILE_ZOOM_LEVELS, BASEMAP_TILE_COUNT_RATIO, sourceId);
          } catch { /* The basemap can change during export. */ }
        });
      } catch { /* Custom sources may not support LOD settings. */ }
    }
  }

  layers.forEach((layer) => {
    if (layer.type !== 'raster') return;
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
