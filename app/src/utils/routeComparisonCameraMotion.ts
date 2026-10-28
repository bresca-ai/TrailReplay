export interface RouteComparisonCameraPose {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

const MAX_ZOOM_LEVELS_PER_SECOND = 1.25;
const CENTER_CHASE_SECONDS = 0.4;
const ANGLE_CHASE_SECONDS = 0.65;

/** The main Follow Behind shot needs no comparison override while every marker is in frame. */
export function markersFitInViewport(points: ReadonlyArray<[number, number]>, width: number, height: number, margin: number) {
  return width > margin * 2 && height > margin * 2 && points.every(([x, y]) =>
    Number.isFinite(x) && Number.isFinite(y)
    && x >= margin && x <= width - margin
    && y >= margin && y <= height - margin);
}

/** Widen a pitched split view while retaining the Follow Behind angle and
 * keeping the primary marker nearer the center of the moving frame. */
export function routeSplitCameraTarget(
  base: RouteComparisonCameraPose,
  fit: Pick<RouteComparisonCameraPose, 'center' | 'zoom'>,
  primary: [number, number],
): RouteComparisonCameraPose {
  const pitchRadians = Math.max(0, Math.min(75, base.pitch)) * Math.PI / 180;
  const pitchZoomAllowance = fit.zoom < base.zoom - 0.01
    ? Math.min(0.65, -Math.log2(Math.cos(pitchRadians)))
    : 0;
  return {
    center: [
      fit.center[0] + (primary[0] - fit.center[0]) * 0.2,
      fit.center[1] + (primary[1] - fit.center[1]) * 0.2,
    ],
    zoom: Math.max(0, Math.min(base.zoom, fit.zoom - pitchZoomAllowance)),
    pitch: base.pitch,
    bearing: base.bearing,
  };
}

/** Advance one simulated playback frame, so preview and export use the same move. */
export function advanceRouteComparisonCamera(
  current: RouteComparisonCameraPose,
  target: RouteComparisonCameraPose,
  elapsedMs: number,
): RouteComparisonCameraPose {
  const seconds = Math.max(0, Math.min(elapsedMs, 250)) / 1000;
  const zoomStep = MAX_ZOOM_LEVELS_PER_SECOND * seconds;
  const centerWeight = 1 - Math.exp(-seconds / CENTER_CHASE_SECONDS);
  const angleWeight = 1 - Math.exp(-seconds / ANGLE_CHASE_SECONDS);
  const bearingDelta = ((target.bearing - current.bearing + 540) % 360) - 180;
  return {
    center: [
      current.center[0] + (target.center[0] - current.center[0]) * centerWeight,
      current.center[1] + (target.center[1] - current.center[1]) * centerWeight,
    ],
    zoom: current.zoom + Math.max(-zoomStep, Math.min(zoomStep, target.zoom - current.zoom)),
    pitch: current.pitch + (target.pitch - current.pitch) * angleWeight,
    bearing: current.bearing + bearingDelta * angleWeight,
  };
}
