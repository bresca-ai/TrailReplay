import type { Map } from 'maplibre-gl';
import type { MapFilter } from '@/types';

export interface BuildingFrameController {
  prepare: () => void;
  isReady: () => boolean;
  setFilter?: (filter: MapFilter) => void;
}

const controllers = new WeakMap<Map, BuildingFrameController>();

export function setBuildingFrameController(map: Map, controller: BuildingFrameController | null) {
  if (controller) controllers.set(map, controller);
  else controllers.delete(map);
}

/** Called after MapLibre has rendered the export pose and loaded its tiles. */
export function prepareBuildingFrame(map: Map, expectTexturedBuildings = false): boolean {
  const controller = controllers.get(map);
  if (!controller) return !expectTexturedBuildings && !map.getLayer('satellite-building-roofs');
  controller.prepare();
  return controller.isReady();
}

/** Keep the custom building shader in sync with the raster basemap. */
export function setBuildingFilter(map: Map, filter: MapFilter) {
  controllers.get(map)?.setFilter?.(filter);
}
