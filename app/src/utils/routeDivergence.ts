import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export interface RoutePoint { lat: number; lon: number; distance: number }
type XY = [number, number];
type Segment = [XY, XY, number, number];

export const ROUTE_DIVERGENCE_THRESHOLD_METERS = 30;
const ROUTE_REJOIN_TOLERANCE_METERS = 5;

function projectToSegment(point: XY, [from, to]: Segment) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / lengthSquared)) : 0;
  return { distanceSquared: (point[0] - from[0] - dx * ratio) ** 2 + (point[1] - from[1] - dy * ratio) ** 2, ratio };
}

/** Spatial index shared by route highlighting and marker correspondence. */
export function createRouteMatcher(primary: readonly RoutePoint[], threshold = 35) {
  if (primary.length < 2) return () => null;
  const origin = primary[0];
  const longitudeScale = 111320 * Math.cos(origin.lat * Math.PI / 180);
  const project = (point: RoutePoint): XY => [
    (((point.lon - origin.lon + 540) % 360) - 180) * longitudeScale,
    (point.lat - origin.lat) * 111320,
  ];
  const cellSize = 128;
  const cells = new Map<string, Segment[]>();
  const longSegments: Segment[] = [];
  for (let index = 1; index < primary.length; index++) {
    const segment: Segment = [project(primary[index - 1]), project(primary[index]), primary[index - 1].distance, primary[index].distance];
    const minX = Math.floor((Math.min(segment[0][0], segment[1][0]) - threshold) / cellSize);
    const maxX = Math.floor((Math.max(segment[0][0], segment[1][0]) + threshold) / cellSize);
    const minY = Math.floor((Math.min(segment[0][1], segment[1][1]) - threshold) / cellSize);
    const maxY = Math.floor((Math.max(segment[0][1], segment[1][1]) + threshold) / cellSize);
    // Avoid filling a huge bounding rectangle for unusually long recording gaps.
    if ((maxX - minX + 1) * (maxY - minY + 1) > 128) {
      longSegments.push(segment);
      continue;
    }
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const key = `${x}:${y}`;
      const entries = cells.get(key) ?? [];
      entries.push(segment);
      cells.set(key, entries);
    }
  }
  return (point: RoutePoint, minimumDistance = 0) => {
    const projected = project(point);
    const candidates = cells.get(`${Math.floor(projected[0] / cellSize)}:${Math.floor(projected[1] / cellSize)}`) ?? [];
    let best: { distance: number; separation: number } | null = null;
    for (const segment of [...candidates, ...longSegments]) {
      const match = projectToSegment(projected, segment);
      const distance = segment[2] + (segment[3] - segment[2]) * match.ratio;
      if (distance < minimumDistance || match.distanceSquared > threshold ** 2) continue;
      if (!best || match.distanceSquared < best.separation ** 2) best = { distance, separation: Math.sqrt(match.distanceSquared) };
    }
    return best;
  };
}

/** Match the recorded lines themselves, so a sparse GPX is not mistaken for a different route. */
export function buildRouteDivergences(primary: readonly RoutePoint[], comparison: readonly RoutePoint[], threshold = ROUTE_DIVERGENCE_THRESHOLD_METERS): FeatureCollection<LineString | Point> {
  const features: Array<Feature<LineString | Point>> = [];
  if (primary.length < 2 || comparison.length < 2) return { type: 'FeatureCollection', features };
  // Find the whole split-to-rejoin section, then decide whether it deserves a
  // highlight. A 30 m tolerance here would clip the start and end of detours.
  const matchSharedLine = createRouteMatcher(primary, ROUTE_REJOIN_TOLERANCE_METERS);
  const matchWithinThreshold = createRouteMatcher(primary, threshold);
  const outside = comparison.map((point) => !matchSharedLine(point));
  const exceedsThreshold = comparison.map((point) => !matchWithinThreshold(point));
  // Brief returns to the shared line (GPS jitter or crossing paths) should not
  // turn a single detour into a cloud of start/end pins.
  let previousOutside = -1;
  outside.forEach((isOutside, index) => {
    if (!isOutside) return;
    if (previousOutside >= 0 && comparison[index].distance - comparison[previousOutside].distance <= 60) {
      for (let gap = previousOutside + 1; gap < index; gap++) outside[gap] = true;
    }
    previousOutside = index;
  });
  for (let index = 0; index < comparison.length; index++) {
    if (!outside[index]) continue;
    const start = Math.max(0, index - 1);
    while (index + 1 < comparison.length && outside[index + 1]) index++;
    const end = Math.min(comparison.length - 1, index + 1);
    if (!exceedsThreshold.slice(start, end + 1).some(Boolean)) continue;
    const coordinates = comparison.slice(start, end + 1).map((point) => [point.lon, point.lat]);
    if (coordinates.length < 2) continue;
    features.push({ type: 'Feature', properties: { startDistance: comparison[start].distance, endDistance: comparison[end].distance }, geometry: { type: 'LineString', coordinates } });
    for (const coordinate of [coordinates[0], coordinates[coordinates.length - 1]]) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coordinate } });
    }
  }
  return { type: 'FeatureCollection', features };
}
