import { getCropRegion } from '@/utils/crop';

type Size = {
  width: number;
  height: number;
};

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ExportOverlayMetrics = ReturnType<typeof getExportOverlayMetrics>;

export function getOverlayRefreshIntervalMs(fps: number) {
  // Re-capturing the DOM overlay is considerably more expensive than drawing
  // the map frame. A 12 fps cadence keeps the elevation marker readable while
  // avoiding a distracting per-frame redraw in the exported video.
  return Math.max(83, Math.round(1000 / Math.min(fps, 12)));
}

export function getStatsValueTimelineBucket(currentTimeMs: number) {
  const safeTime = Number.isFinite(currentTimeMs) ? Math.max(0, currentTimeMs) : 0;
  return Math.floor(safeTime / 100);
}

export function getExportOverlayMetrics(
  containerRect: Size,
  recordW: number,
  recordH: number
) {
  const { cropX, cropY, cropW, cropH } = getCropRegion(containerRect, recordW, recordH);

  return {
    cropX,
    cropY,
    cropW,
    cropH,
    scaleToRecording: recordW / cropW,
    margin: Math.round(recordW * 0.025),
  };
}

export function getCapturedCanvasDrawSize(
  captureCanvas: Size,
  scaleToRecording: number,
  captureScale: number
) {
  return {
    drawWidth: (captureCanvas.width * scaleToRecording) / captureScale,
    drawHeight: (captureCanvas.height * scaleToRecording) / captureScale,
  };
}

/**
 * Maps a CSS font size from an element's intrinsic (untransformed) layout
 * into the final draw rectangle. Static labels captured by html2canvas follow
 * this same ratio, so manually redrawn values retain their exact proportions.
 */
export function getExportedOverlayFontSize(
  cssFontSize: number,
  intrinsicElementHeight: number,
  drawHeight: number,
) {
  if (!Number.isFinite(cssFontSize) || cssFontSize <= 0) return 0;
  if (!Number.isFinite(intrinsicElementHeight) || intrinsicElementHeight <= 0) return cssFontSize;
  if (!Number.isFinite(drawHeight) || drawHeight <= 0) return 0;
  return cssFontSize * (drawHeight / intrinsicElementHeight);
}

export function getStatsOverlayDrawRect(params: {
  captureCanvas: Size;
  /** Scale used only for width/height computation (pass 1 when width is already pre-scaled). */
  scaleToRecording: number;
  /** Scale used to convert screen-pixel position → recording-pixel position. */
  positionScale?: number;
  recordW: number;
  recordH: number;
  margin: number;
  /** When provided, the stats are drawn at the element's actual screen position. */
  elementRect?: { left: number; top: number };
  containerRect?: { left: number; top: number };
  cropX?: number;
  cropY?: number;
  /** User-selected visual scale for the complete stats block. */
  sizeScale?: number;
}) {
  const sizeScale = Number.isFinite(params.sizeScale)
    ? Math.max(0.6, Math.min(8, params.sizeScale ?? 1))
    : 1;
  const rawWidth = params.captureCanvas.width * params.scaleToRecording * sizeScale;
  const maxWidth = Math.min(
    rawWidth,
    params.recordW - (params.margin * 2),
    (params.recordH - (params.margin * 2)) * (params.captureCanvas.width / params.captureCanvas.height),
  );
  const drawWidth = Math.max(0, maxWidth);
  const drawHeight = params.captureCanvas.height * (drawWidth / params.captureCanvas.width);

  // Mirror the element's actual DOM position into video coordinates.
  if (params.elementRect && params.containerRect && params.cropX !== undefined && params.cropY !== undefined) {
    const posScale = params.positionScale ?? params.scaleToRecording;
    const drawX = (params.elementRect.left - params.containerRect.left - params.cropX) * posScale;
    const drawY = (params.elementRect.top - params.containerRect.top - params.cropY) * posScale;
    return {
      drawX: Math.max(0, drawX),
      drawY: Math.max(0, drawY),
      drawWidth,
      drawHeight,
    };
  }

  return {
    drawX: (params.recordW - drawWidth) / 2,
    drawY: params.margin,
    drawWidth,
    drawHeight,
  };
}

export function getElevationOverlayDrawRect(params: {
  captureCanvas: Size;
  scaleToRecording: number;
  recordW: number;
  recordH: number;
  margin: number;
}) {
  const rawWidth = params.captureCanvas.width * params.scaleToRecording;
  const drawWidth = Math.min(rawWidth, params.recordW * 0.85);
  const drawHeight = params.captureCanvas.height * (drawWidth / params.captureCanvas.width);

  return {
    drawX: (params.recordW - drawWidth) / 2,
    drawY: params.recordH - drawHeight - params.margin,
    drawWidth,
    drawHeight,
  };
}

/**
 * The popup's `<img>` is styled `object-fit: contain` so the whole photo
 * stays visible regardless of its aspect ratio vs. its box — the element's
 * own bounding box is still the *full* box, though, not the letterboxed
 * content within it. Drawing straight into `popupRect` (as
 * `getPopupOverlayDrawRect` does) stretches the natural image to fill that
 * full box, ignoring its aspect ratio, so exported photos looked squashed/
 * stretched. This re-derives the same contain-fitted sub-rect the browser
 * computes for `object-fit: contain`, so the "crisp" redraw matches what's
 * actually visible on screen.
 */
export function getObjectContainRect(box: Rect, naturalWidth: number, naturalHeight: number): Rect {
  if (naturalWidth <= 0 || naturalHeight <= 0 || box.width <= 0 || box.height <= 0) return box;

  const boxAspect = box.width / box.height;
  const imageAspect = naturalWidth / naturalHeight;
  const width = imageAspect > boxAspect ? box.width : box.height * imageAspect;
  const height = imageAspect > boxAspect ? box.width / imageAspect : box.height;

  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

export function getPopupOverlayDrawRect(params: {
  popupRect: Rect;
  containerRect: Rect;
  cropX: number;
  cropY: number;
  scaleToRecording: number;
}) {
  return {
    drawX: (params.popupRect.left - params.containerRect.left - params.cropX) * params.scaleToRecording,
    drawY: (params.popupRect.top - params.containerRect.top - params.cropY) * params.scaleToRecording,
    drawWidth: params.popupRect.width * params.scaleToRecording,
    drawHeight: params.popupRect.height * params.scaleToRecording,
  };
}

export function isDrawableRect(rect: { drawWidth: number; drawHeight: number }) {
  return rect.drawWidth > 0 && rect.drawHeight > 0;
}
