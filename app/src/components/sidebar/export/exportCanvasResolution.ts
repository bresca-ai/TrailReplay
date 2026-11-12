import type { Map as MapLibreMap } from 'maplibre-gl';
import { getCropRegion } from '@/utils/crop';


/** Verify the actual backing buffer, including after a browser resize. */
export function assertExportCanvasResolution(map: MapLibreMap, resolution: { width: number; height: number }): void {
  const canvas = map.getCanvas();
  if (!(canvas.clientWidth > 0 && canvas.clientHeight > 0 && resolution.width > 0 && resolution.height > 0)) {
    throw new Error('The map does not have a valid size for video export.');
  }
  const crop = getCropRegion({ width: canvas.clientWidth, height: canvas.clientHeight }, resolution.width, resolution.height);
  const actualCropWidth = crop.cropW * canvas.width / canvas.clientWidth;
  const actualCropHeight = crop.cropH * canvas.height / canvas.clientHeight;
  if (!Number.isFinite(actualCropWidth) || !Number.isFinite(actualCropHeight)
    || actualCropWidth + 1 < resolution.width || actualCropHeight + 1 < resolution.height) {
    throw new Error('This device cannot render the selected video resolution. Choose a lower quality or a different aspect ratio.');
  }
}

/** Render the live map crop at native video resolution, or reject the export. */
export function setExportCanvasResolution(map: MapLibreMap, resolution: { width: number; height: number }): () => void {
  const canvas = map.getCanvas();
  const { clientWidth, clientHeight } = canvas;
  if (clientWidth <= 0 || clientHeight <= 0 || resolution.width <= 0 || resolution.height <= 0) {
    throw new Error('The map does not have a valid size for video export.');
  }
  const crop = getCropRegion({ width: clientWidth, height: clientHeight }, resolution.width, resolution.height);
  const previousRatio = map.getPixelRatio();
  const targetRatio = Math.max(previousRatio, resolution.width / crop.cropW, resolution.height / crop.cropH);
  let changed = false;
  try {
    if (targetRatio > previousRatio) {
      changed = true;
      map.setPixelRatio(targetRatio);
    }
    // MapLibre may clamp to GPU limits even when getPixelRatio reports the request.
    assertExportCanvasResolution(map, resolution);
  } catch (error) {
    if (changed) map.setPixelRatio(previousRatio);
    throw error;
  }
  return () => { if (changed) map.setPixelRatio(previousRatio); };
}
