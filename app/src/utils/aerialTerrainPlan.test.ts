import { describe, expect, it } from 'vitest';
import { aerialBearingDifference, aerialCameraDimensions, aerialLookAheadPoint, aerialSightlineObstruction, buildTerrainCameraPlan, getReadyAerialTerrainPlan, limitGlideWeights, trailingFlightBearing, planAerialBearingIndices, registerAerialTerrainPlan, terrainPlanBearing, terrainPlanZoomOffset, terrainTileCoverage, unregisterAerialTerrainPlan, waitForAerialTerrainPlan } from './aerialTerrainPlan';
import { getAerialFollowBearing } from './replayCameraPlan';
import { effectiveTerrainExaggeration } from './terrainExaggeration';

describe('route-wide aerial terrain plan', () => {
  it('uses the same terrain scale as the renderer for recorded elevation and unusual settings', () => {
    expect(effectiveTerrainExaggeration({ show3DTerrain: true })).toBe(1);
    expect(effectiveTerrainExaggeration({ show3DTerrain: true, recordedElevationPrototype: true, terrainExaggeration: 2 })).toBe(1);
    expect(effectiveTerrainExaggeration({ show3DTerrain: true, terrainExaggeration: 8 })).toBe(3);
    expect(effectiveTerrainExaggeration({ show3DTerrain: false, terrainExaggeration: 2 })).toBe(0);
  });
  const route = Array.from({ length: 101 }, (_, i) => [0, i * 0.0001]);
  it('matches the measured MapLibre camera distance at the Montroig descent', () => {
    const camera = aerialCameraDimensions(41.884803, 14.71656, 74.5568, 675);
    expect(camera.radius).toBeCloseTo(2112, -1);
    expect(camera.height).toBeCloseTo(584, -1);
  });
  it('looks ahead by route distance through a bend and stops at the end', () => {
    const bend = [[0, 0], [0.001, 0], [0.001, 0.01]];
    const ahead = aerialLookAheadPoint(bend, 0, 500)!;
    expect(ahead[0]).toBeCloseTo(0.001, 6);
    expect(ahead[1]).toBeCloseTo((500 - 111.32) / 111320, 5);
    expect(aerialLookAheadPoint(bend, 1, 500)).toEqual(bend[2]);
  });
  it('chooses a continuous alternative when a ridge blocks the planned view', () => {
    const flat = buildTerrainCameraPlan(route, () => 0, 1);
    const ridge = buildTerrainCameraPlan(route, ([, lat]) => lat < -0.001 ? 1100 : 0, 1);
    expect(flat).not.toBeNull();
    expect(ridge).not.toBeNull();
    expect(ridge!.every(Number.isFinite)).toBe(true);
    expect(Math.abs(((ridge![0] - flat![0] + 540) % 360) - 180)).toBeGreaterThanOrEqual(30);
    for (let i = 1; i < ridge!.length; i++) expect(Math.abs(ridge![i] - ridge![i - 1])).toBeLessThan(20);
    expect(Number.isFinite(terrainPlanBearing(ridge!, 0.505))).toBe(true);
  });
  it('refuses a partial terrain plan when elevation is missing', () => {
    expect(buildTerrainCameraPlan(route, () => null, 1)).toBeNull();
  });
  it('starts looking along the first leg when terrain permits', () => {
    const modestRidge = buildTerrainCameraPlan(route, ([, lat]) => lat < -0.001 ? 30 : 0, 1);
    expect(modestRidge).not.toBeNull();
    expect(Math.abs(aerialBearingDifference(modestRidge![0], 0))).toBeLessThan(30);
  });
  it('uses the direction of a short route for its opening', () => {
    const shortRoute = [[0, 0], [0.001, 0]];
    const plan = buildTerrainCameraPlan(shortRoute, () => 0, 1);
    expect(plan).not.toBeNull();
    expect(Math.abs(aerialBearingDifference(plan![0], 90))).toBeLessThan(30);
  });
  it('flies behind the route through a bend rather than turning at its corner', () => {
    const bend = [[0, 0], [0.009, 0], [0.009, 0.009]];
    expect(trailingFlightBearing(bend, 0)).toBeCloseTo(90, 0);
    expect(trailingFlightBearing(bend, 0.5)).toBeCloseTo(90, 0);
    const afterCorner = trailingFlightBearing(bend, 0.75);
    expect(afterCorner).toBeGreaterThan(30);
    expect(afterCorner).toBeLessThan(75);
    expect(trailingFlightBearing(bend, 1)).toBeLessThan(afterCorner);
  });
  it('stays behind an unobstructed route as it curves around', () => {
    const curve = Array.from({ length: 101 }, (_, i) => {
      const angle = Math.PI * i / 100;
      return [0.01 * (1 - Math.cos(angle)), 0.01 * Math.sin(angle)];
    });
    const plan = buildTerrainCameraPlan(curve, () => 0, 1);
    expect(plan).not.toBeNull();
    const frontViews = plan!.filter((bearing, i) =>
      Math.abs(aerialBearingDifference(bearing, getAerialFollowBearing(curve, i / 100))) > 90);
    expect(frontViews.length).toBeLessThan(10);
  });
  it('detects a narrow ridge between the old sparse sight-line samples', () => {
    const target: [number, number] = [0, 0];
    const camera: [number, number] = [0, 0.0145];
    const ridge = ([, lat]: [number, number]) => lat > 0.003 && lat < 0.0035 ? 200 : 0;
    expect(aerialSightlineObstruction(target, 0, camera, 380, ridge, 1)).toBeGreaterThan(100);
    expect(aerialSightlineObstruction(target, 0, camera, 380, () => 0, 1)).toBe(0);
    expect(aerialSightlineObstruction(target, 0, camera, 380, () => null, 1)).toBeNull();
  });
  it('starts a necessary turn early and spreads it across the route', () => {
    const viewCosts = Array.from({ length: 8 }, (_, frame) =>
      Array.from({ length: 24 }, (_, direction) => {
        if (frame === 0) return direction === 0 ? 0 : 5000;
        if (frame === 7) return direction === 3 ? 0 : 5000;
        return 0;
      }));
    const planned = planAerialBearingIndices(viewCosts);
    expect(planned[0]).toBe(0);
    expect(planned[7]).toBe(3);
    const turns = planned.slice(1).map((direction, index) => Math.abs(aerialBearingDifference(direction * 15, planned[index] * 15)));
    expect(Math.max(...turns)).toBeLessThanOrEqual(15);
    expect(turns.filter(turn => turn > 0).length).toBeGreaterThanOrEqual(3);
  });
  it('limits a terrain-driven turn even when a sudden change looks cheaper', () => {
    const viewCosts = Array.from({ length: 8 }, (_, frame) =>
      Array.from({ length: 24 }, (_, direction) =>
        direction === (frame < 4 ? 0 : 4) ? 0 : 100000));
    const planned = planAerialBearingIndices(viewCosts);
    for (let i = 1; i < planned.length; i++) {
      expect(Math.abs(aerialBearingDifference(planned[i] * 15, planned[i - 1] * 15))).toBeLessThanOrEqual(15);
    }
  });
  it('accounts for camera travel when choosing between equally clear views', () => {
    const viewCosts = [[0, 10000, 10000, 10000], [20, 0, 10000, 10000]];
    const motionCosts = [[], Array.from({ length: 4 }, () => [0, 1000, 0, 0])];
    expect(planAerialBearingIndices(viewCosts, motionCosts)).toEqual([0, 0]);
  });
  it('keeps moving along a clear curved route instead of pivoting in place', () => {
    const curve = Array.from({ length: 101 }, (_, i) => {
      const angle = Math.PI * i / 200;
      return [0.08 * (1 - Math.cos(angle)), 0.08 * Math.sin(angle)];
    });
    const plan = buildTerrainCameraPlan(curve, () => 0, 1)!;
    const camera = (i: number) => {
      const radians = plan[i] * Math.PI / 180;
      return [curve[i][0] * 111320 - Math.sin(radians) * 1450, curve[i][1] * 111320 - Math.cos(radians) * 1450];
    };
    let stalled = 0;
    for (let i = 1; i < curve.length; i++) {
      const [x0, y0] = camera(i - 1), [x1, y1] = camera(i);
      const dx = (curve[i][0] - curve[i - 1][0]) * 111320;
      const dy = (curve[i][1] - curve[i - 1][1]) * 111320;
      const routeDistance = Math.hypot(dx, dy);
      const forward = ((x1 - x0) * dx + (y1 - y0) * dy) / routeDistance;
      if (forward < routeDistance * 0.25) stalled++;
    }
    expect(stalled).toBeLessThan(10);
  });
  it('plans a separate camera path on a clear bend', () => {
    const curve = Array.from({ length: 101 }, (_, i) => {
      const angle = Math.PI * i / 200;
      return [0.04 * (1 - Math.cos(angle)), 0.04 * Math.sin(angle)];
    });
    const geometry = { elevationData: curve.map(() => ({ elevation: 0 })), viewportHeight: 720 };
    const plan = buildTerrainCameraPlan(curve, () => 0, 1, 0.01, geometry)!;
    const offsets = plan.map((_, i) => terrainPlanZoomOffset(plan, i / 100));
    expect(offsets.every(Number.isFinite)).toBe(true);
    expect(Math.max(...offsets.map(Math.abs))).toBeGreaterThan(0.001);
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThan(0.25);
    const slower = buildTerrainCameraPlan(curve, () => 0, 1, 0.01, { ...geometry, durationSeconds: 120 })!;
    const faster = buildTerrainCameraPlan(curve, () => 0, 1, 0.01, { ...geometry, durationSeconds: 30 })!;
    expect(faster.some((_, i) => Math.abs(terrainPlanZoomOffset(faster, i / 100) - terrainPlanZoomOffset(slower, i / 100)) > 0.001)).toBe(true);
  });
  it('eases the camera adjustment down before a restricted view and back up afterwards', () => {
    const limits = [1, 1, 1, 0, 1, 1, 1];
    const weights = limitGlideWeights(limits);
    expect(weights).toEqual([0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75]);
    expect(weights.every((value, i) => value <= limits[i])).toBe(true);
    const shorterReplay = limitGlideWeights(limits, 0.125);
    expect(shorterReplay[2]).toBe(0.125);
    expect(shorterReplay[4]).toBe(0.125);
  });
  it('keeps terrain coverage bounded by lowering resolution for a long route', () => {
    const longRoute = Array.from({ length: 101 }, (_, i) => [i * 0.1, 40]);
    const coverage = terrainTileCoverage(longRoute);
    expect(coverage).not.toBeNull();
    expect(coverage!.zoom).toBeLessThan(12);
    expect(coverage!.keys.size).toBeLessThanOrEqual(128);
  });
  it('covers intermediate route samples even when the planned poses are far apart', () => {
    const longRoute = Array.from({ length: 101 }, (_, i) => [i * 0.5, 40]);
    const coverage = terrainTileCoverage(longRoute)!;
    const world = 2 ** coverage.zoom;
    // Each planned sightline also reads the route 0.4% before and after its
    // marker; those readings can lie well outside the camera-radius disk.
    for (let i = 0; i < 100; i++) for (const delta of [0.004, 0.006]) {
      const longitude = (i / 100 + delta) * 50;
      const x = Math.floor((longitude + 180) / 360 * world);
      const y = Math.floor((1 - Math.asinh(Math.tan(40 * Math.PI / 180)) / Math.PI) / 2 * world);
      expect(coverage.keys.has(`${x}/${y}`)).toBe(true);
    }
  });
  it('handles multiple turns and joins planned bearings without a velocity jump', () => {
    expect(aerialBearingDifference(10, 1090)).toBe(0);
    expect(aerialBearingDifference(350, 730)).toBe(-20);
    const plan = [0, 10, 40, 55];
    const epsilon = 0.00001, pivot = 1 / 3;
    const left = (terrainPlanBearing(plan, pivot) - terrainPlanBearing(plan, pivot - epsilon)) / epsilon;
    const right = (terrainPlanBearing(plan, pivot + epsilon) - terrainPlanBearing(plan, pivot)) / epsilon;
    expect(left).toBeCloseTo(right, 1);
  });
  it('waits for a replacement plan if preparation changes during export', async () => {
    let finish!: (value: number[] | null) => void;
    const first = new Promise<number[] | null>(resolve => { finish = resolve; });
    registerAerialTerrainPlan(route, first);
    const waiting = waitForAerialTerrainPlan(route);
    registerAerialTerrainPlan(route, Promise.resolve([20, 30]));
    finish(null);
    await expect(waiting).resolves.toEqual([20, 30]);
  });
  it('exposes only the current completed plan to the shot editor', async () => {
    let finish!: (value: number[] | null) => void;
    const oldPlan = new Promise<number[] | null>(resolve => { finish = resolve; });
    const replacement = Promise.resolve([20, 30]);
    registerAerialTerrainPlan(route, oldPlan);
    registerAerialTerrainPlan(route, replacement);
    await replacement;
    finish([1, 2]);
    await oldPlan;
    expect(getReadyAerialTerrainPlan(route)).toEqual([20, 30]);
    unregisterAerialTerrainPlan(route, oldPlan);
    expect(getReadyAerialTerrainPlan(route)).toEqual([20, 30]);
    unregisterAerialTerrainPlan(route, replacement);
    expect(getReadyAerialTerrainPlan(route)).toBeNull();
  });
});
