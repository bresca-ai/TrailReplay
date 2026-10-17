export interface CanvasPoint { x: number; y: number; }

export interface FitBox { x: number; y: number; w: number; h: number; }

export interface RouteTransformOpts { offsetX: number; offsetY: number; scale: number; }

export interface CropRegion {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

export interface MapFitPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function getMapFirstRouteSafeArea(options: {
  posterWidth: number;
  posterHeight: number;
  showLocation: boolean;
  showStats: boolean;
  showElevation: boolean;
}): FitBox {
  const aspect = options.posterWidth / options.posterHeight;
  const titleBottom = 0.04 * aspect
    + 0.112 * aspect
    + 0.01
    + 0.05
    + 0.04
    + (options.showLocation ? 0.04 : 0);
  const panelHeight = (options.showStats ? 0.115 : 0)
    + (options.showElevation ? 0.105 : 0);
  const bottom = 1 - panelHeight - 0.04;
  const top = Math.min(0.32, titleBottom);

  return {
    x: 0.08,
    y: top,
    w: 0.84,
    h: Math.max(0.2, bottom - top),
  };
}

export function getMapFirstFitPadding(
  containerWidth: number,
  containerHeight: number,
  crop: CropRegion,
  safeArea: FitBox,
): MapFitPadding {
  const safeRight = crop.cropX + (safeArea.x + safeArea.w) * crop.cropW;
  const safeBottom = crop.cropY + (safeArea.y + safeArea.h) * crop.cropH;

  return {
    top: crop.cropY + safeArea.y * crop.cropH,
    right: containerWidth - safeRight,
    bottom: containerHeight - safeBottom,
    left: crop.cropX + safeArea.x * crop.cropW,
  };
}

export function getMapPanTargetPoint(
  center: CanvasPoint,
  deltaX: number,
  deltaY: number,
  cropWidth: number,
  cropHeight: number,
): CanvasPoint {
  return {
    x: center.x - deltaX * cropWidth,
    y: center.y - deltaY * cropHeight,
  };
}

export function getMapZoomForScale(
  currentZoom: number,
  scaleFactor: number,
  minZoom: number,
  maxZoom: number,
): number {
  return Math.max(minZoom, Math.min(maxZoom, currentZoom + Math.log2(scaleFactor)));
}

export function getRouteBboxNorm(
  points: ReadonlyArray<CanvasPoint>,
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
): { x: number; y: number; w: number; h: number } | null {
  if (points.length < 2) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding;
  const right = Math.max(...xs) + padding;
  const bottom = Math.max(...ys) + padding;

  return {
    x: left / canvasWidth,
    y: top / canvasHeight,
    w: (right - left) / canvasWidth,
    h: (bottom - top) / canvasHeight,
  };
}

// Fit lat/lon points into a canvas box, north-up.
// ponytail: cos(lat) mercator correction; ±0.5% accurate for routes <500 km
export function fitRouteToBox(
  latLons: ReadonlyArray<{ lat: number; lon: number }>,
  box: FitBox,
  transform: RouteTransformOpts,
): CanvasPoint[] {
  if (latLons.length < 2) return [];

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const { lat, lon } of latLons) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  const meanLat = (minLat + maxLat) / 2;
  const meanLon = (minLon + maxLon) / 2;
  const lonScale = Math.cos(meanLat * Math.PI / 180);
  const routeW = (maxLon - minLon) * lonScale || 1e-9;
  const routeH = maxLat - minLat || 1e-9;

  const baseScale = routeW / routeH > box.w / box.h
    ? box.w / routeW
    : box.h / routeH;
  const scale = baseScale * transform.scale;

  const cx = box.x + box.w / 2 + transform.offsetX;
  const cy = box.y + box.h / 2 + transform.offsetY;

  return latLons.map(({ lat, lon }) => ({
    x: cx + (lon - meanLon) * lonScale * scale,
    y: cy - (lat - meanLat) * scale,
  }));
}

export function downsampleRoute<T>(points: T[], maxN: number): T[] {
  if (points.length <= maxN) return points;
  const step = points.length / maxN;
  return Array.from({ length: maxN }, (_, i) => points[Math.floor(i * step)]);
}
