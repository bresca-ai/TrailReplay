import type { Map as MapLibreMap } from 'maplibre-gl';
import { getVideoCropRegion } from '@/utils/crop';

/** Never encode frames at a different size from the selected output. */
export function assertRecordingCanvasResolution(canvas: HTMLCanvasElement, resolution: { width: number; height: number }): void {
  if (canvas.width !== resolution.width || canvas.height !== resolution.height) {
    throw new Error(`Video export size changed: expected ${resolution.width}×${resolution.height}, got ${canvas.width}×${canvas.height}. Start a new export.`);
  }
}

/** A clamped backing buffer can still be scaled into the output video. */
export function assertExportCanvasUsable(map: MapLibreMap, resolution: { width: number; height: number }): void {
  const canvas = map.getCanvas();
  if (![canvas.clientWidth, canvas.clientHeight, canvas.width, canvas.height, resolution.width, resolution.height]
    .every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('The map does not have a valid size for video export.');
  }
}

/** Prefer native resolution; drawExportFrame upscales the crop if the GPU clamps it. */
export function setExportCanvasResolution(map: MapLibreMap, resolution: { width: number; height: number }): () => void {
  const canvas = map.getCanvas();
  const { clientWidth, clientHeight } = canvas;
  if (clientWidth <= 0 || clientHeight <= 0 || resolution.width <= 0 || resolution.height <= 0) {
    throw new Error('The map does not have a valid size for video export.');
  }
  const crop = getVideoCropRegion({ width: clientWidth, height: clientHeight }, resolution.width, resolution.height);
  const previousRatio = map.getPixelRatio();
  const targetRatio = Math.max(previousRatio, resolution.width / crop.cropW, resolution.height / crop.cropH);
  let changed = false;
  try {
    if (targetRatio > previousRatio) {
      changed = true;
      map.setPixelRatio(targetRatio);
    }
    // MapLibre may clamp the canvas on small devices. Its existing crop is still
    // usable, even if scaling it to the output dimensions loses some detail.
    assertExportCanvasUsable(map, resolution);
  } catch (error) {
    if (changed) map.setPixelRatio(previousRatio);
    throw error;
  }
  return () => { if (changed) map.setPixelRatio(previousRatio); };
}
