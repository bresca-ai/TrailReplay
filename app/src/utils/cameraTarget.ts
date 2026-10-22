import type * as maplibregl from 'maplibre-gl';
import type { ReplayCameraPose } from '@/utils/replayCameraPlan';

/** Convert an authored sea-level target to MapLibre's exaggerated camera height. */
export function toMapCameraOptions(
  map: maplibregl.Map,
  pose: ReplayCameraPose,
  terrainEnabled = true,
): maplibregl.CameraOptions {
  const options: maplibregl.CameraOptions = {
    center: pose.center,
    bearing: pose.bearing,
    pitch: pose.pitch,
    zoom: pose.zoom,
  };
  if (pose.centerElevationMeters !== undefined) {
    const terrain = terrainEnabled ? map.getTerrain() : null;
    const exaggeration = terrain?.exaggeration;
    options.elevation = terrain
      ? pose.centerElevationMeters * (typeof exaggeration === 'number' ? exaggeration : 1)
      : 0;
  }
  return options;
}
