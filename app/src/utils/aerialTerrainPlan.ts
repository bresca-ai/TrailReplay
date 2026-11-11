import { getAerialFollowBearing, getInterpolatedRouteCoordinate, getPlaybackCameraPose, getRouteCoordinateAtProgress } from './replayCameraPlan';
import { getSmoothedCameraAnchor } from './cinematicCameraAnchor';
import { METERS_PER_PIXEL_AT_ZOOM_0 } from './followBehindCamera';
import { TERRAIN_SAMPLE_INDEX_OFFSETS } from '@/components/map/cameraUtils';

type Point = [number, number];
type Elevation = (point: Point) => number | null;
type CameraGeometry = { elevationData: Array<{ elevation: number; progress?: number }>; viewportHeight: number; durationSeconds?: number };
const ZOOM = 12;
const SIZE = 256;
const COUNT = 101;
const DIRECTIONS = 24;
const RADIUS = 1450;
const pendingPlans = new WeakMap<number[][], Promise<number[] | null>>();
const readyPlans = new WeakMap<number[][], number[]>();
const glideDistances = new WeakMap<number[], number[]>();

/** Share preparation with export so a cold export cannot race the planner. */
export function registerAerialTerrainPlan(coordinates: number[][], plan: Promise<number[] | null>): void {
  pendingPlans.set(coordinates, plan);
  readyPlans.delete(coordinates);
  void plan.then(result => {
    if (pendingPlans.get(coordinates) === plan && result) readyPlans.set(coordinates, result);
  }, () => {});
}

export function unregisterAerialTerrainPlan(coordinates: number[][], plan: Promise<number[] | null>): void {
  if (pendingPlans.get(coordinates) !== plan) return;
  pendingPlans.delete(coordinates);
  readyPlans.delete(coordinates);
}

export function getReadyAerialTerrainPlan(coordinates: number[][]): number[] | null {
  return readyPlans.get(coordinates) ?? null;
}

export async function waitForAerialTerrainPlan(coordinates: number[][]): Promise<number[] | null> {
  for (;;) {
    const pending = pendingPlans.get(coordinates);
    if (!pending) return null;
    const plan = await pending;
    if (pendingPlans.get(coordinates) === pending) return plan;
  }
}

function tilePosition([lon, lat]: Point, zoom = ZOOM): Point {
  const y = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  const world = 2 ** zoom;
  return [(lon + 180) / 360 * world, (1 - Math.asinh(Math.tan(y)) / Math.PI) / 2 * world];
}
function offset([lon, lat]: Point, east: number, north: number): Point {
  return [lon + east / (111320 * Math.max(0.01, Math.cos(lat * Math.PI / 180))), lat + north / 111320];
}
export function aerialBearingDifference(a: number, b: number): number {
  return (((a - b) % 360 + 540) % 360) - 180;
}

/** MapLibre's default perspective camera distance in metres at a given pose. */
export function aerialCameraDimensions(latitude: number, zoom: number, pitch: number, viewportHeight: number): { radius: number; height: number } {
  const metresPerPixel = METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos(Math.max(-85, Math.min(85, latitude)) * Math.PI / 180) / 2 ** zoom;
  const distance = 1.5 * viewportHeight * metresPerPixel;
  const radians = pitch * Math.PI / 180;
  return { radius: distance * Math.sin(radians), height: distance * Math.cos(radians) };
}

/** A route point a fixed ground distance ahead, including through bends. */
export function aerialLookAheadPoint(coordinates: number[][], progress: number, metres: number): Point | null {
  const current = getRouteCoordinateAtProgress(coordinates, progress);
  if (!current || coordinates.length < 2) return current;
  const index = Math.max(0, Math.min(1, progress)) * (coordinates.length - 1);
  const longitudeScale = 111320 * Math.max(0.01, Math.cos(current[1] * Math.PI / 180));
  let previous: Point = current;
  let remaining = Math.max(0, metres);
  if (remaining === 0) return current;
  for (let i = Math.ceil(index); i < coordinates.length; i++) {
    const point: Point = [coordinates[i][0], coordinates[i][1]];
    const length = Math.hypot((point[0] - previous[0]) * longitudeScale, (point[1] - previous[1]) * 111320);
    if (length >= remaining && length > 0) {
      const fraction = remaining / length;
      return [previous[0] + (point[0] - previous[0]) * fraction, previous[1] + (point[1] - previous[1]) * fraction];
    }
    remaining -= length;
    previous = point;
  }
  return previous;
}

/** Aim from a point trailing the route, rather than orbiting the marker at a bend. */
export function trailingFlightBearing(coordinates: number[][], progress: number, trailingMeters = RADIUS): number {
  const current = getRouteCoordinateAtProgress(coordinates, progress);
  if (!current || coordinates.length < 2) return 0;
  const longitudeScale = 111320 * Math.max(0.01, Math.cos(current[1] * Math.PI / 180));
  const distance = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * longitudeScale, (a[1] - b[1]) * 111320);
  const index = Math.max(0, Math.min(1, progress)) * (coordinates.length - 1);
  let previous: number[] = current;
  let remaining = trailingMeters;
  let trailing: number[] | null = null;
  for (let i = Math.floor(index); i >= 0; i--) {
    const point = coordinates[i];
    const length = distance(previous, point);
    if (length >= remaining && length > 0) {
      const fraction = remaining / length;
      trailing = [previous[0] + (point[0] - previous[0]) * fraction, previous[1] + (point[1] - previous[1]) * fraction];
      break;
    }
    remaining -= length;
    previous = point;
  }
  if (!trailing) {
    const initial = getAerialFollowBearing(coordinates, 0) * Math.PI / 180;
    trailing = offset([previous[0], previous[1]], -Math.sin(initial) * remaining, -Math.cos(initial) * remaining);
  }
  const east = (current[0] - trailing[0]) * longitudeScale;
  const north = (current[1] - trailing[1]) * 111320;
  return Math.hypot(east, north) < 1 ? getAerialFollowBearing(coordinates, progress) : Math.atan2(east, north) * 180 / Math.PI;
}

/** Maximum terrain protrusion above a camera-to-route sight line, in metres. */
export function aerialSightlineObstruction(target: Point, targetHeight: number, camera: Point, cameraHeight: number, elevation: Elevation, exaggeration: number): number | null {
  let obstruction = 0;
  // At the normal 1.45 km camera radius these samples are roughly 45 m apart,
  // comparable to the DEM's resolution. The old 15%-spaced samples left gaps
  // of more than 200 m and could miss an entire ridge between the camera and
  // the route, even though it was plainly visible in the rendered flyover.
  for (let i = 1; i <= 32; i++) {
    const fraction = i / 32;
    const terrain = elevation([target[0] + (camera[0] - target[0]) * fraction, target[1] + (camera[1] - target[1]) * fraction]);
    if (terrain === null) return null;
    const lineHeight = targetHeight * (1 - fraction) + cameraHeight * fraction;
    // Taper clearance at the route endpoint: the route itself lies on the
    // ground, so requiring 25 m immediately above it falsely blocks flat land.
    const clearance = 25 * Math.min(1, fraction / 0.15);
    obstruction = Math.max(obstruction, terrain * exaggeration + clearance - lineHeight);
  }
  return obstruction;
}

/** Plan turns across the whole route, including the cost of changing turn speed. */
export function planAerialBearingIndices(viewCosts: number[][], motionCosts?: number[][][], motionAcceleration?: (frame: number, before: number, previous: number, current: number) => number): number[] {
  const count = viewCosts.length;
  if (count === 0) return [];
  const directions = viewCosts[0].length;
  if (count === 1) return [viewCosts[0].indexOf(Math.min(...viewCosts[0]))];
  const step = 360 / directions;
  const difference = (a: number, b: number) => aerialBearingDifference(a * step, b * step);
  // State is the last two directions, so the next turn can be compared with
  // the preceding one. This lets the camera start a turn before a view is
  // needed and settle afterwards instead of repeatedly starting and stopping.
  let costs = Array.from({ length: directions }, (_, previous) =>
    Array.from({ length: directions }, (_, current) => {
      const turn = Math.abs(difference(current, previous));
      if (turn > step + 1e-6) return Infinity;
      return viewCosts[0][previous] + viewCosts[1][current] + turn * 7 + turn * turn * 0.5 + (motionCosts?.[1]?.[previous]?.[current] ?? 0);
    }));
  const parents: number[][][] = [];
  for (let i = 2; i < count; i++) {
    const next = Array.from({ length: directions }, () => Array<number>(directions).fill(Infinity));
    const parent = Array.from({ length: directions }, () => Array<number>(directions).fill(0));
    for (let previous = 0; previous < directions; previous++) for (let current = 0; current < directions; current++) {
      const turn = difference(current, previous);
      if (Math.abs(turn) > step + 1e-6) continue;
      for (let before = 0; before < directions; before++) {
        const priorTurn = difference(previous, before);
        const acceleration = turn - priorTurn;
        const candidate = costs[before][previous] + Math.abs(turn) * 7 + turn * turn * 0.5 + acceleration * acceleration * 0.35 + viewCosts[i][current] + (motionCosts?.[i]?.[previous]?.[current] ?? 0) + (motionAcceleration?.(i, before, previous, current) ?? 0);
        if (candidate < next[previous][current]) { next[previous][current] = candidate; parent[previous][current] = before; }
      }
    }
    parents[i] = parent;
    costs = next;
  }
  let previous = 0, current = 0, best = Infinity;
  for (let a = 0; a < directions; a++) for (let b = 0; b < directions; b++) {
    if (costs[a][b] < best) { best = costs[a][b]; previous = a; current = b; }
  }
  const result = Array<number>(count);
  result[count - 1] = current;
  result[count - 2] = previous;
  for (let i = count - 1; i >= 2; i--) {
    const before = parents[i][previous][current];
    result[i - 2] = before;
    current = previous;
    previous = before;
  }
  return result;
}

/** Pick a globally coherent series of views, balancing visibility and smooth rotation. */
export function buildTerrainCameraPlan(coordinates: number[][], elevation: Elevation, exaggeration: number, halfWindow = 0, geometry?: CameraGeometry): number[] | null {
  if (coordinates.length < 2) return null;
  const costs: number[][] = [];
  const cameraPositions: Point[][] = [];
  const anchors: Point[] = [];
  const views: Array<{ targets: Array<{ point: Point; height: number }>; radius: number; height: number; targetHeight: number }> = [];
  for (let i = 0; i < COUNT; i++) {
    const progress = i / (COUNT - 1);
    const center = getRouteCoordinateAtProgress(coordinates, progress)!;
    const centerHeight = elevation(center);
    if (centerHeight === null) return null;
    // A clear line to the marker alone can still look straight into a valley
    // wall, hiding the route immediately around it. Score the neighbouring
    // route as well so the shot reveals the section being travelled.
    const routeTargets: Array<{ point: Point; height: number }> = [{ point: center, height: centerHeight }];
    for (const neighbour of [progress - 0.004, progress + 0.004]) {
      if (neighbour < 0 || neighbour > 1) continue;
      const point = getRouteCoordinateAtProgress(coordinates, neighbour)!;
      const height = elevation(point);
      if (height === null) return null;
      routeTargets.push({ point, height });
    }
    // Keep the approaching section visible, not just the immediate marker.
    // A fixed ground distance works across routes of very different lengths.
    const ahead = aerialLookAheadPoint(coordinates, progress, 500);
    if (ahead) {
      const height = elevation(ahead);
      if (height === null) return null;
      routeTargets.push({ point: ahead, height });
    }
    const pose = geometry && getPlaybackCameraPose({ cameraMode: 'aerial-follow', coordinates, elevationData: geometry.elevationData, followBehindZoomLevel: 1, progress });
    const anchor = getSmoothedCameraAnchor({ coordinates, progress, smoothingHalfWindow: halfWindow, markerPosition: center, zoom: pose?.zoom ?? 14.8 });
    const anchorHeight = elevation(anchor);
    if (anchorHeight === null) return null;
    let cameraTargetHeight = anchorHeight * exaggeration;
    if (geometry) {
      let sum = 0;
      for (const offset of TERRAIN_SAMPLE_INDEX_OFFSETS) {
        const point = getInterpolatedRouteCoordinate(coordinates, progress * (coordinates.length - 1) + offset);
        if (!point) return null;
        const height = elevation(point);
        if (height === null) return null;
        sum += height;
      }
      cameraTargetHeight = sum / TERRAIN_SAMPLE_INDEX_OFFSETS.length * exaggeration;
    }
    const dimensions = pose && geometry ? aerialCameraDimensions(center[1], pose.zoom, pose.pitch, geometry.viewportHeight) : { radius: RADIUS, height: 380 };
    const base = getAerialFollowBearing(coordinates, progress);
    const flightAim = trailingFlightBearing(coordinates, progress, dimensions.radius);
    const nextCosts: number[] = [];
    const positions: Point[] = [];
    for (let j = 0; j < DIRECTIONS; j++) {
      const angle = j * 360 / DIRECTIONS;
      const rad = angle * Math.PI / 180;
      let obstruction = 0;
      const camera = offset(anchor, -Math.sin(rad) * dimensions.radius, -Math.cos(rad) * dimensions.radius);
      positions.push(camera);
      for (const target of routeTargets) {
        const blocked = aerialSightlineObstruction(target.point, target.height * exaggeration, camera, cameraTargetHeight + dimensions.height, elevation, exaggeration);
        if (blocked === null) return null;
        obstruction = Math.max(obstruction, blocked);
      }
      // Begin behind the track, then yield gradually to the route-wide terrain
      // plan. Visibility can still win when the opening is obstructed.
      const openingT = Math.max(0, Math.min(1, progress / 0.14));
      const followWeight = 20 + 3 * (1 - openingT * openingT * (3 - 2 * openingT));
      const routeDifference = Math.abs(aerialBearingDifference(angle, base));
      // A camera facing backwards relative to the route puts it in front of
      // the runner. Prefer a following shot, but keep a finite cost so a
      // blocked mountainside can still justify moving around to the front.
      const frontPenalty = Math.max(0, routeDifference - 75) ** 2 * 0.08;
      const viewCost = Math.max(0, obstruction) * 15 + routeDifference * 0.22 + frontPenalty
        + Math.abs(aerialBearingDifference(angle, flightAim)) * followWeight;
      nextCosts.push(viewCost);
    }
    costs.push(nextCosts);
    cameraPositions.push(positions);
    anchors.push(anchor);
    views.push({ targets: routeTargets, radius: dimensions.radius, height: dimensions.height, targetHeight: cameraTargetHeight });
  }
  // A good view at each instant is not enough: rotating around the marker can
  // cancel the camera's forward travel. Score the actual camera displacement
  // between route-wide candidates so it keeps gliding along the flight path.
  const motionCosts: number[][][] = [];
  for (let i = 1; i < COUNT; i++) {
    const lonScale = 111320 * Math.max(0.01, Math.cos(anchors[i][1] * Math.PI / 180));
    const east = (anchors[i][0] - anchors[i - 1][0]) * lonScale;
    const north = (anchors[i][1] - anchors[i - 1][1]) * 111320;
    const distance = Math.hypot(east, north);
    motionCosts[i] = cameraPositions[i - 1].map(previous => cameraPositions[i].map(current => {
      if (distance < 1) return 0;
      const dx = (current[0] - previous[0]) * lonScale;
      const dy = (current[1] - previous[1]) * 111320;
      const forward = (dx * east + dy * north) / distance;
      const lateral = Math.abs(dx * north - dy * east) / distance;
      return Math.max(0, distance * 0.6 - forward) * 0.8 + lateral * 0.3;
    }));
  }
  // Turning at a constant angular rate can still make the physical camera
  // speed up and change direction sharply as the route bends. Penalize changes
  // in its actual ground velocity too, so the chosen path drifts through the
  // curve rather than pivoting around the watched point.
  const motionAcceleration = (frame: number, before: number, previous: number, current: number) => {
    const a = cameraPositions[frame - 2][before];
    const b = cameraPositions[frame - 1][previous];
    const c = cameraPositions[frame][current];
    const lonScale = 111320 * Math.max(0.01, Math.cos(anchors[frame][1] * Math.PI / 180));
    return Math.hypot((c[0] - 2 * b[0] + a[0]) * lonScale, (c[1] - 2 * b[1] + a[1]) * 111320) * 0.3;
  };
  const result = planAerialBearingIndices(costs, motionCosts, motionAcceleration).map(index => index * 360 / DIRECTIONS);
  for (let i = 1; i < result.length; i++) result[i] = result[i - 1] + aerialBearingDifference(result[i], result[i - 1]);
  const smoothed = result.map((_, i) => {
    let sum = 0, weight = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(result.length - 1, i + 3); j++) {
      const w = Math.exp(-0.5 * ((j - i) / 1.4) ** 2); sum += result[j] * w; weight += w;
    }
    return sum / weight;
  });
  if (!geometry) return smoothed;

  // Smooth the camera's position separately from its aim. A moving camera can
  // cut a wider corner than the watched point; a bearing filter alone can only
  // rotate a fixed-length arm around it. Keep this adjustment only where its
  // sight lines are no worse than the original terrain-aware shot.
  const positions = smoothed.map((bearing, i) => {
    const angle = bearing * Math.PI / 180;
    return offset(anchors[i], -Math.sin(angle) * views[i].radius, -Math.cos(angle) * views[i].radius);
  });
  const candidates: Point[] = [];
  const limits: number[] = [];
  const checks: Array<(point: Point) => boolean> = [];
  // Keep the camera's weight tied to playback time instead of route length.
  // The cap prevents a very short replay from averaging over the entire route.
  const sigma = Math.max(0.5, Math.min(12, 1.5 * (COUNT - 1) / Math.max(1, geometry.durationSeconds ?? 60)));
  const window = Math.ceil(sigma * 2);
  for (let i = 0; i < COUNT; i++) {
    let lon = 0, lat = 0, weight = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(COUNT - 1, i + window); j++) {
      const w = Math.exp(-0.5 * ((j - i) / sigma) ** 2);
      lon += positions[j][0] * w; lat += positions[j][1] * w; weight += w;
    }
    const candidate: Point = [lon / weight, lat / weight];
    const v = views[i], anchor = anchors[i];
    const scale = 111320 * Math.max(0.01, Math.cos(anchor[1] * Math.PI / 180));
    const distance = (point: Point) => Math.hypot((point[0] - anchor[0]) * scale, (point[1] - anchor[1]) * 111320);
    const obstruction = (point: Point) => {
      const ratio = distance(point) / v.radius;
      return Math.max(...v.targets.map(target => aerialSightlineObstruction(target.point, target.height * exaggeration, point, v.targetHeight + v.height * ratio, elevation, exaggeration) ?? Infinity));
    };
    const baseObstruction = obstruction(positions[i]);
    const safe = (point: Point) => {
      const ratio = distance(point) / v.radius;
      const candidateObstruction = obstruction(point);
      return ratio >= 0.85 && ratio <= 1.15 && Number.isFinite(baseObstruction) && Number.isFinite(candidateObstruction) && candidateObstruction <= baseObstruction + 10;
    };
    let limit = 0;
    for (let step = 1; step <= 4; step++) {
      const fraction = step / 4;
      const point: Point = [positions[i][0] + (candidate[0] - positions[i][0]) * fraction, positions[i][1] + (candidate[1] - positions[i][1]) * fraction];
      if (!safe(point)) break;
      limit = fraction;
    }
    candidates.push(candidate);
    limits.push(limit);
    checks.push(safe);
  }
  const secondsPerSample = Math.max(1, geometry.durationSeconds ?? 60) / (COUNT - 1);
  const weights = limitGlideWeights(limits, Math.min(1, secondsPerSample / 2.4));
  const distances: number[] = [];
  const bearings: number[] = [];
  for (let i = 0; i < COUNT; i++) {
    const v = views[i], anchor = anchors[i];
    const scale = 111320 * Math.max(0.01, Math.cos(anchor[1] * Math.PI / 180));
    const distance = (point: Point) => Math.hypot((point[0] - anchor[0]) * scale, (point[1] - anchor[1]) * 111320);
    const point: Point = [positions[i][0] + (candidates[i][0] - positions[i][0]) * weights[i], positions[i][1] + (candidates[i][1] - positions[i][1]) * weights[i]];
    const chosen = weights[i] > 0 && checks[i](point) ? point : positions[i];
    const east = (anchor[0] - chosen[0]) * scale, north = (anchor[1] - chosen[1]) * 111320;
    const rawBearing = Math.atan2(east, north) * 180 / Math.PI;
    bearings.push(smoothed[i] + aerialBearingDifference(rawBearing, smoothed[i]));
    distances.push(Math.log2(v.radius / Math.max(1, distance(chosen))));
  }
  glideDistances.set(bearings, distances);
  return bearings;
}

/** Ease into restricted sections without exceeding any sampled safety limit. */
export function limitGlideWeights(limits: number[], maxChange = 0.25): number[] {
  const result = limits.slice();
  for (let i = 1; i < result.length; i++) result[i] = Math.min(result[i], result[i - 1] + maxChange);
  for (let i = result.length - 2; i >= 0; i--) result[i] = Math.min(result[i], result[i + 1] + maxChange);
  return result;
}

/** Zoom correction for the independently planned camera position. */
export function terrainPlanZoomOffset(plan: number[], progress: number): number {
  const distances = glideDistances.get(plan);
  if (!distances?.length) return 0;
  return terrainPlanBearing(distances, progress);
}

export function terrainPlanBearing(plan: number[], progress: number): number {
  const index = Math.max(0, Math.min(1, progress)) * (plan.length - 1);
  const lower = Math.floor(index), upper = Math.min(plan.length - 1, lower + 1);
  if (lower === upper) return plan[lower];
  // A monotone Hermite curve preserves the planned range while avoiding a
  // change in angular velocity each time playback passes a sampled pose.
  const tangent = (i: number) => {
    if (i === 0) return plan[1] - plan[0];
    if (i === plan.length - 1) return plan[i] - plan[i - 1];
    const left = plan[i] - plan[i - 1], right = plan[i + 1] - plan[i];
    return left * right <= 0 ? 0 : 2 * left * right / (left + right);
  };
  const t = index - lower, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * plan[lower]
    + (t3 - 2 * t2 + t) * tangent(lower)
    + (-2 * t3 + 3 * t2) * plan[upper]
    + (t3 - t2) * tangent(upper);
}

/** Cover the camera's entire search area, lowering DEM resolution if necessary. */
export function terrainTileCoverage(coordinates: number[][], geometry?: CameraGeometry, halfWindow = 0): { zoom: number; keys: Set<string> } | null {
  const areas: Array<{ center: Point; radius: number }> = [];
  for (let i = 0; i < COUNT; i++) {
    const progress = i / (COUNT - 1);
    const center = getRouteCoordinateAtProgress(coordinates, progress);
    if (!center) return null;
    const pose = geometry && getPlaybackCameraPose({ cameraMode: 'aerial-follow', coordinates, elevationData: geometry.elevationData, followBehindZoomLevel: 1, progress });
    const radius = pose && geometry ? aerialCameraDimensions(center[1], pose.zoom, pose.pitch, geometry.viewportHeight).radius : RADIUS;
    const anchor = getSmoothedCameraAnchor({ coordinates, progress, smoothingHalfWindow: halfWindow, markerPosition: center, zoom: pose?.zoom ?? 14.8 });
    const lonScale = 111320 * Math.max(0.01, Math.cos(center[1] * Math.PI / 180));
    const distanceFromCenter = (point: Point) => Math.hypot((point[0] - center[0]) * lonScale, (point[1] - center[1]) * 111320);
    // The sight lines start at neighbouring route points and end at a camera
    // offset from the smoothed anchor. Cover both ends and everything between
    // them, including the samples used to calculate camera target elevation.
    let extent = radius + distanceFromCenter(anchor);
    for (const neighbour of [progress - 0.004, progress + 0.004]) {
      if (neighbour < 0 || neighbour > 1) continue;
      const point = getRouteCoordinateAtProgress(coordinates, neighbour);
      if (point) extent = Math.max(extent, distanceFromCenter(point));
    }
    const ahead = aerialLookAheadPoint(coordinates, progress, 500);
    if (ahead) extent = Math.max(extent, distanceFromCenter(ahead));
    if (geometry) for (const sampleOffset of TERRAIN_SAMPLE_INDEX_OFFSETS) {
      const point = getInterpolatedRouteCoordinate(coordinates, progress * (coordinates.length - 1) + sampleOffset);
      if (point) extent = Math.max(extent, distanceFromCenter(point));
    }
    areas.push({ center, radius: Math.max(RADIUS * 2.5, extent + 100) });
  }
  for (let zoom = ZOOM; zoom >= 6; zoom--) {
    const keys = new Set<string>();
    const world = 2 ** zoom;
    for (const { center, radius } of areas) {
      const [left, bottom] = tilePosition(offset(center, -radius, -radius), zoom);
      const [right, top] = tilePosition(offset(center, radius, radius), zoom);
      for (let x = Math.floor(left); x <= Math.floor(right); x++) for (let y = Math.max(0, Math.floor(top)); y <= Math.min(world - 1, Math.floor(bottom)); y++) {
        keys.add(`${((x % world) + world) % world}/${y}`);
      }
      if (keys.size > 128) break;
    }
    if (keys.size <= 128) return { zoom, keys };
  }
  return null;
}

/** Fetch a bounded set of Terrarium DEM tiles surrounding the whole route. */
export async function loadRouteTerrainPlan(coordinates: number[][], exaggeration: number, signal: AbortSignal, halfWindow = 0, geometry?: CameraGeometry): Promise<number[] | null> {
  const coverage = terrainTileCoverage(coordinates, geometry, halfWindow);
  if (!coverage) return null;
  const { zoom, keys } = coverage;
  const tiles = new Map<string, Uint8ClampedArray>();
  const queue = [...keys];
  async function worker() {
    while (queue.length && !signal.aborted) {
      const key = queue.pop()!;
      const response = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${key}.png`, { signal });
      if (!response.ok) throw new Error(`DEM tile HTTP ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) { bitmap.close(); throw new Error('DEM canvas unavailable'); }
      context.drawImage(bitmap, 0, 0); bitmap.close();
      tiles.set(key, context.getImageData(0, 0, SIZE, SIZE).data);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  if (signal.aborted) return null;
  const elevation: Elevation = point => {
    const [x, y] = tilePosition(point, zoom), tx = Math.floor(x), ty = Math.floor(y);
    const world = 2 ** zoom;
    const data = tiles.get(`${((tx % world) + world) % world}/${ty}`); if (!data) return null;
    const px = Math.min(255, Math.floor((x - tx) * SIZE)), py = Math.min(255, Math.floor((y - ty) * SIZE));
    const index = (py * SIZE + px) * 4;
    return data[index] * 256 + data[index + 1] + data[index + 2] / 256 - 32768;
  };
  return buildTerrainCameraPlan(coordinates, elevation, exaggeration, halfWindow, geometry);
}
