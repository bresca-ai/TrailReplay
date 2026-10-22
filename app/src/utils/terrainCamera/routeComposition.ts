/** Perspective-ground geometry for a bounded set of route samples. */
export interface RouteCompositionPoint { lon: number; lat: number; elevationMeters: number | null; isStart?: boolean; }
export interface RouteCompositionTarget { lon: number; lat: number; elevationMeters: number; }
export interface RouteCompositionViewport { widthPx: number; heightPx: number; verticalFovDeg: number; terrainExaggeration: number; }
export interface RouteCompositionCandidate { bearingDeg: number; pitchDeg: number; zoom: number; target: RouteCompositionTarget; coverage: number; mountainAlignment: number; startVisible: boolean; }

interface RouteFootprint { id: string; points: RouteCompositionPoint[]; centerLon: number; centerLat: number; halfWidthMeters: number; halfHeightMeters: number; }

const rad = Math.PI / 180;
const LAT_METERS = 111_320;
const EARTH = 40_075_016.686;
const norm = (v: number) => (v % 360 + 360) % 360;

function unwrapLon(lon: number, origin: number) { return origin + (((lon - origin + 540) % 360) - 180); }

/** Connected components of route bounds that overlap after a 15% expansion. */
export function groupOverlappingRouteFootprints(routes: Array<{ id: string; points: RouteCompositionPoint[] }>): string[][] {
  const footprints: RouteFootprint[] = routes.filter(route => route.points.length > 0).map(route => {
    const origin = route.points[0].lon;
    const lons = route.points.map(point => unwrapLon(point.lon, origin));
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...route.points.map(point => point.lat)), maxLat = Math.max(...route.points.map(point => point.lat));
    const centerLat = (minLat + maxLat) / 2;
    const width = (maxLon - minLon) * LAT_METERS * Math.max(.01, Math.cos(centerLat * rad));
    const height = (maxLat - minLat) * LAT_METERS;
    return { id: route.id, points: route.points, centerLon: (minLon + maxLon) / 2, centerLat, halfWidthMeters: Math.max(50, width * .5), halfHeightMeters: Math.max(50, height * .5) };
  });
  const parent = footprints.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const unite = (a: number, b: number) => { const rootA = find(a), rootB = find(b); if (rootA !== rootB) parent[rootB] = rootA; };
  for (let i = 0; i < footprints.length; i++) for (let j = i + 1; j < footprints.length; j++) {
    const a = footprints[i], b = footprints[j];
    const dx = (unwrapLon(b.centerLon, a.centerLon) - a.centerLon) * LAT_METERS * Math.max(.01, Math.cos((a.centerLat + b.centerLat) * .5 * rad));
    const dy = (b.centerLat - a.centerLat) * LAT_METERS;
    if (Math.abs(dx) <= (a.halfWidthMeters + b.halfWidthMeters) * 1.15 && Math.abs(dy) <= (a.halfHeightMeters + b.halfHeightMeters) * 1.15) unite(i, j);
  }
  const groups = new Map<number, string[]>();
  footprints.forEach((route, i) => { const root = find(i); groups.set(root, [...(groups.get(root) ?? []), route.id]); });
  return [...groups.values()];
}

/** Project a route point through the same pitched perspective basis used by the camera pose. */
export function projectRoutePoint(point: RouteCompositionPoint, candidate: Pick<RouteCompositionCandidate, 'bearingDeg' | 'pitchDeg' | 'zoom' | 'target'>, viewport: RouteCompositionViewport) {
  const cosLat = Math.max(.01, Math.cos(candidate.target.lat * rad));
  const dx = unwrapLon(point.lon, candidate.target.lon) - candidate.target.lon;
  const east = dx * LAT_METERS * cosLat;
  const north = (point.lat - candidate.target.lat) * LAT_METERS;
  const b = candidate.bearingDeg * rad, p = candidate.pitchDeg * rad;
  const right = east * Math.cos(b) - north * Math.sin(b);
  const forward = east * Math.sin(b) + north * Math.cos(b);
  const targetZ = candidate.target.elevationMeters * viewport.terrainExaggeration;
  const pointZ = (point.elevationMeters ?? candidate.target.elevationMeters) * viewport.terrainExaggeration;
  const dz = pointZ - targetZ;
  const focalPx = viewport.heightPx / (2 * Math.tan(viewport.verticalFovDeg * rad / 2));
  const cameraDistance = focalPx * EARTH * cosLat / (512 * 2 ** candidate.zoom);
  const depth = cameraDistance + forward * Math.sin(p) - dz * Math.cos(p);
  const up = forward * Math.cos(p) + dz * Math.sin(p);
  if (depth <= 0) return { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, depth };
  return { x: viewport.widthPx / 2 + focalPx * right / depth, y: viewport.heightPx / 2 - focalPx * up / depth, depth };
}

function inside(point: { x: number; y: number; depth: number }, viewport: RouteCompositionViewport) {
  // Leave space for the stats above and elevation profile below the route.
  return point.depth > 0 && point.x >= viewport.widthPx * .10 && point.x <= viewport.widthPx * .90
    && point.y >= viewport.heightPx * .23 && point.y <= viewport.heightPx * .82;
}

/** Compare every bearing and pitch, finding the closest zoom that contains the whole sampled course. */
export function composeRouteCandidates(points: RouteCompositionPoint[], viewport: RouteCompositionViewport): RouteCompositionCandidate[] {
  if (!points.length) return [];
  const originLon = points[0].lon;
  const unwrappedLons = points.map(point => unwrapLon(point.lon, originLon));
  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const minLon = Math.min(...unwrappedLons), maxLon = Math.max(...unwrappedLons);
  const targetLon = (minLon + maxLon) / 2;
  const targetLat = (Math.min(...points.map(point => point.lat)) + Math.max(...points.map(point => point.lat))) / 2;
  const elevations = points.map(point => point.elevationMeters).filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  // Aim near the low course elevations so the camera stays close to route height while looking toward the mountain.
  const targetElevation = elevations.length ? elevations[Math.floor((elevations.length - 1) * .28)] : 0;
  const target = { lon: targetLon, lat: targetLat, elevationMeters: targetElevation };
  const low = points.find(point => point.elevationMeters === elevations[0]);
  const high = points.find(point => point.elevationMeters === elevations[elevations.length - 1]);
  const uphillBearing = low && high ? norm(Math.atan2((unwrapLon(high.lon, low.lon) - low.lon) * LAT_METERS * Math.cos(lat * rad), (high.lat - low.lat) * LAT_METERS) / rad) : 0;
  const out: RouteCompositionCandidate[] = [];
  for (let bearingIndex = 0; bearingIndex < 8; bearingIndex++) {
    const bearingDeg = bearingIndex * 45;
    for (const pitchDeg of [72, 78, 82]) {
      let lo = 4, hi = 18;
      // Binary-search the highest zoom where all required samples remain inside the padded viewport.
      for (let step = 0; step < 12; step++) {
        const mid = (lo + hi) / 2;
        const candidate = { bearingDeg, pitchDeg, zoom: mid, target };
        if (points.every(point => inside(projectRoutePoint(point, candidate, viewport), viewport))) lo = mid;
        else hi = mid;
      }
      const candidate = { bearingDeg, pitchDeg, zoom: Math.floor(lo * 20) / 20, target };
      const projected = points.map(point => projectRoutePoint(point, candidate, viewport));
      const visibleCount = projected.filter(point => inside(point, viewport)).length;
      const starts = points.filter(point => point.isStart);
      const mountainAlignment = Math.abs(((bearingDeg - uphillBearing + 540) % 360) - 180);
      out.push({ bearingDeg, pitchDeg, zoom: Math.floor(lo * 20) / 20, target, coverage: visibleCount / points.length, mountainAlignment, startVisible: starts.length > 0 && starts.every(start => inside(projectRoutePoint(start, candidate, viewport), viewport)) });
    }
  }
  return out;
}

export function routePointInFrame(point: RouteCompositionPoint, candidate: RouteCompositionCandidate, viewport: RouteCompositionViewport): boolean {
  return inside(projectRoutePoint(point, candidate, viewport), viewport);
}
