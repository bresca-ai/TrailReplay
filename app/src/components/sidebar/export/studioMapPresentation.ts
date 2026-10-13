import { BASEMAP_PRESENTATIONS } from '@/components/map/mapStyle';
import type { Map as MapLibreMap } from 'maplibre-gl';

// MapLibre normally decays raster tile zoom toward the horizon on pitched
// views. That is efficient, but satellite providers often source adjacent zoom
// levels from different captures, producing visible colour/exposure seams.
// Studio export values a consistent image over request count, so keep one
// source zoom on screen and allow a larger (still bounded) tile budget.
export const STUDIO_MAX_TILE_ZOOM_LEVELS = 1;
export const STUDIO_TILE_COUNT_RATIO = 16;

// MapLibre 6.12 defaults. Restore these after export so interactive playback
// keeps its normal bandwidth and GPU footprint.
export const DEFAULT_MAX_TILE_ZOOM_LEVELS = 9.314;
export const DEFAULT_TILE_COUNT_RATIO = 3;

/** Applies reversible, export-only raster quality settings. */
export function applyStudioMapPresentation(
  map: MapLibreMap,
  mapStyle: string,
): () => void {
  const restores: Array<() => void> = [];
  const layers = map.getStyle()?.layers ?? [];

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

  const presentation = BASEMAP_PRESENTATIONS[mapStyle] ?? BASEMAP_PRESENTATIONS.satellite;
  for (const sourceId of [presentation.sourceId, presentation.fallbackSourceId]) {
    if (!map.getSource(sourceId)) continue;
    try {
      map.setSourceTileLodParams(
        STUDIO_MAX_TILE_ZOOM_LEVELS,
        STUDIO_TILE_COUNT_RATIO,
        sourceId,
      );
      restores.push(() => {
        try {
          map.setSourceTileLodParams(
            DEFAULT_MAX_TILE_ZOOM_LEVELS,
            DEFAULT_TILE_COUNT_RATIO,
            sourceId,
          );
        } catch {
          // The source can disappear if the basemap changes during export.
        }
      });
    } catch {
      // Do not make export unavailable if a custom source rejects LOD control.
    }
  }

  return () => {
    restores.reverse().forEach((restore) => restore());
  };
}
