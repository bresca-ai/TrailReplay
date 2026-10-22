import { BASEMAP_PRESENTATIONS } from '@/components/map/mapStyle';
import type { Map as MapLibreMap } from 'maplibre-gl';

// Retain detail near the camera while letting distant imagery become coarser.
// Forcing the center zoom all the way to the horizon bypasses MapLibre's tile
// budget and can request hundreds of tiles during a single cinematic pan.
// A small zoom range limits imagery seams without disabling that budget.
export const BASEMAP_MAX_TILE_ZOOM_LEVELS = 4;
export const BASEMAP_TILE_COUNT_RATIO = 4;

/** Apply the same bounded imagery detail policy in preview and tile warmup. */
export function applyConsistentBasemapTileLod(
  map: MapLibreMap,
  mapStyle: string,
): string[] {
  const presentation = BASEMAP_PRESENTATIONS[mapStyle] ?? BASEMAP_PRESENTATIONS.satellite;
  const appliedSourceIds: string[] = [];

  for (const sourceId of [presentation.sourceId, presentation.fallbackSourceId]) {
    if (!map.getSource(sourceId)) continue;
    try {
      map.setSourceTileLodParams(
        BASEMAP_MAX_TILE_ZOOM_LEVELS,
        BASEMAP_TILE_COUNT_RATIO,
        sourceId,
      );
      appliedSourceIds.push(sourceId);
    } catch {
      // Custom sources may not support MapLibre's tile LOD controls.
    }
  }

  return appliedSourceIds;
}
