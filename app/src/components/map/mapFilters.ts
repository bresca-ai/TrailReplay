import type * as maplibregl from 'maplibre-gl';
import type { MapFilter } from '@/types';
import {
  STATIC_BASEMAP_LAYER_IDS,
  STATIC_FALLBACK_LAYER_IDS,
} from '@/components/map/mapStyle';

export interface BasemapFilterPaint {
  'raster-saturation': number;
  'raster-contrast': number;
  'raster-brightness-max': number;
}

// Applied to the imagery only (see MapFilter). Each preset drains color and
// nothing else, so the map keeps the tonal range of the original photography:
// contrast and brightness stay untouched everywhere except Noir, which is
// meant to read as a deliberately dark treatment.
export const BASEMAP_FILTER_PAINT: Record<MapFilter, BasemapFilterPaint> = {
  none: { 'raster-saturation': 0, 'raster-contrast': 0, 'raster-brightness-max': 1 },
  muted: { 'raster-saturation': -0.5, 'raster-contrast': 0, 'raster-brightness-max': 1 },
  mono: { 'raster-saturation': -1, 'raster-contrast': 0, 'raster-brightness-max': 1 },
  noir: { 'raster-saturation': -1, 'raster-contrast': 0.3, 'raster-brightness-max': 0.75 },
};

/** Every raster basemap layer the filter has to stay in sync with. */
export const FILTERABLE_BASEMAP_LAYER_IDS = [
  ...STATIC_BASEMAP_LAYER_IDS,
  ...STATIC_FALLBACK_LAYER_IDS,
  'wayback',
  'fallback-wayback',
  'enhanced-hillshade',
] as const;

export function applyBasemapFilter(map: maplibregl.Map, filter: MapFilter) {
  const paint = BASEMAP_FILTER_PAINT[filter] ?? BASEMAP_FILTER_PAINT.none;
  let updatedLayer = false;

  FILTERABLE_BASEMAP_LAYER_IDS.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    updatedLayer = true;
    (Object.keys(paint) as (keyof BasemapFilterPaint)[]).forEach((property) => {
      map.setPaintProperty(layerId, property, paint[property]);
    });
  });

  // An idle map may not schedule another frame after a batch of raster paint
  // changes. Camera movement does, which made the filter appear only after the
  // user nudged the map. Request one frame explicitly so the click is visible
  // immediately without forcing a continuous render loop.
  if (updatedLayer) map.triggerRepaint();
}
