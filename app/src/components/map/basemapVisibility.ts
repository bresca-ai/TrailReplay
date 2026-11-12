import type { Map as MapLibreMap } from 'maplibre-gl';
import { createDefaultSettings } from '@/store/defaults';
import { BASEMAP_PRESENTATIONS, STATIC_BASEMAP_LAYER_IDS, STATIC_FALLBACK_LAYER_IDS } from './mapStyle';

/** Keep the map's rendered basemap in sync with the selected project style. */
export function applyBasemapVisibility(map: MapLibreMap, mapStyle: string): void {
  const presentation = BASEMAP_PRESENTATIONS[mapStyle] ?? BASEMAP_PRESENTATIONS[createDefaultSettings().mapStyle];
  const visible = new Set([presentation.layerId, presentation.fallbackLayerId]);
  for (const layerId of [...STATIC_BASEMAP_LAYER_IDS, ...STATIC_FALLBACK_LAYER_IDS, 'wayback', 'fallback-wayback']) {
    if (!map.getLayer(layerId)) continue;
    const desired = visible.has(layerId) ? 'visible' : 'none';
    if ((map.getLayoutProperty(layerId, 'visibility') ?? 'visible') !== desired) {
      map.setLayoutProperty(layerId, 'visibility', desired);
    }
  }
}
