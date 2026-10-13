import { BASEMAP_PRESENTATIONS } from '@/components/map/mapStyle';
import type { Map as MapLibreMap } from 'maplibre-gl';

// MapLibre normally lowers raster zoom toward the horizon in pitched views.
// Satellite providers can use visibly different imagery at adjacent zooms, so
// mixing those levels in one frame creates colour/exposure seams. One level
// keeps the frame coherent; the ratio bounds how many tiles that may require.
export const BASEMAP_MAX_TILE_ZOOM_LEVELS = 1;
export const BASEMAP_TILE_COUNT_RATIO = 16;

type TileZoomCalculator = (
  requestedCenterZoom: number,
  distanceToTile2D: number,
  distanceToTileZ: number,
  distanceToCenter3D: number,
  cameraVerticalFov: number,
) => number;

interface LodControllableSource {
  calculateTileZoom?: TileZoomCalculator;
}

const ZOOM_IN_SWITCH_FRACTION = 0.75;
const ZOOM_OUT_SWITCH_FRACTION = 0.75;

/**
 * Use one near-field source zoom across the viewport, with hysteresis so small
 * camera zoom corrections do not repeatedly exchange whole imagery pyramids.
 */
export function createUniformBasemapTileZoomCalculator(): TileZoomCalculator {
  let selectedZoom: number | null = null;

  return (requestedCenterZoom) => {
    if (selectedZoom === null) selectedZoom = Math.floor(requestedCenterZoom);
    while (requestedCenterZoom >= selectedZoom + ZOOM_IN_SWITCH_FRACTION) selectedZoom += 1;
    while (requestedCenterZoom < selectedZoom - ZOOM_OUT_SWITCH_FRACTION) selectedZoom -= 1;
    return selectedZoom;
  };
}

/** Keep the active basemap on one source zoom across the visible viewport. */
export function applyConsistentBasemapTileLod(
  map: MapLibreMap,
  mapStyle: string,
): string[] {
  const presentation = BASEMAP_PRESENTATIONS[mapStyle] ?? BASEMAP_PRESENTATIONS.satellite;
  const appliedSourceIds: string[] = [];

  for (const sourceId of [presentation.sourceId, presentation.fallbackSourceId]) {
    const source = map.getSource(sourceId) as LodControllableSource | undefined;
    if (!source) continue;
    try {
      // Use the public setter to invalidate the source's current cover. Replace
      // its distance-based calculator before that scheduled update runs: the
      // built-in one-level preset can still decay at extreme perspective,
      // whereas returning the center zoom is the exact policy required here.
      map.setSourceTileLodParams(
        BASEMAP_MAX_TILE_ZOOM_LEVELS,
        BASEMAP_TILE_COUNT_RATIO,
        sourceId,
      );
      source.calculateTileZoom = createUniformBasemapTileZoomCalculator();
      appliedSourceIds.push(sourceId);
    } catch {
      // Custom sources may not support MapLibre's tile LOD controls.
    }
  }

  return appliedSourceIds;
}
