import { describe, expect, it } from 'vitest';
import { parseGPX } from './gpxParser';
import { interpolateTrackPoint } from './gpx/interpolateTrackPoint';
import { comparisonDistanceAtPrimary, getRouteComparisonPlan, routeProgressWithSlowdown } from './routeComparisonPlayback';

function track(points: Array<[number, number, number]>) {
  const base = parseGPX('<gpx><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.01"/></trkseg></trk></gpx>', 'route.gpx');
  return { ...base, totalDistance: points.at(-1)![2], points: points.map(([x, y, distance]) => ({ ...base.points[0], lat: y / 111320, lon: x / 111320, distance, time: null })) };
}

describe('route comparison playback', () => {
  it('keeps markers together on a shared route despite different sample spacing', () => {
    const primary = track([[0, 0, 0], [1000, 0, 1000]]);
    const comparison = track([[0, 0, 0], [250, 0, 250], [600, 0, 600], [1000, 0, 1000]]);
    const plan = getRouteComparisonPlan(primary, comparison);
    expect(comparisonDistanceAtPrimary(plan, 400)).toBeCloseTo(400);
    expect(plan.differences).toEqual([]);
    expect(plan.splits).toEqual([]);
  });

  it('moves both markers along their own branch and synchronizes the rejoin without timestamps', () => {
    const primary = track([[0, 0, 0], [100, 0, 100], [200, 0, 200], [300, 0, 300]]);
    const comparison = track([[0, 0, 0], [100, 0, 100], [150, 100, 212], [200, 0, 324], [300, 0, 424]]);
    const plan = getRouteComparisonPlan(primary, comparison);
    const branchDistance = comparisonDistanceAtPrimary(plan, 150);
    expect(branchDistance).toBeCloseTo(212);
    expect(interpolateTrackPoint(comparison, branchDistance)?.lat).toBeCloseTo(100 / 111320);
    expect(comparisonDistanceAtPrimary(plan, 200)).toBeCloseTo(324);
    expect(comparisonDistanceAtPrimary(plan, 300)).toBeCloseTo(424);
    expect(plan.differences.length).toBeGreaterThan(0);
    expect(plan.splits.length).toBeGreaterThan(0);
    expect(plan.differences[0].start).toBeLessThanOrEqual(plan.splits[0].start);
  });

  it('allocates more frames to differences while preserving start, finish and monotonic seeking', () => {
    const differences = [{ start: 0.4, end: 0.6 }];
    expect(routeProgressWithSlowdown(0, differences, 0.25)).toBe(0);
    expect(routeProgressWithSlowdown(1, differences, 0.25)).toBe(1);
    const normalStep = routeProgressWithSlowdown(0.1, differences, 0.25) - routeProgressWithSlowdown(0.09, differences, 0.25);
    const slowStep = routeProgressWithSlowdown(0.5, differences, 0.25) - routeProgressWithSlowdown(0.49, differences, 0.25);
    expect(normalStep / slowStep).toBeCloseTo(4);
    let previous = 0;
    for (let index = 0; index <= 100; index++) {
      const progress = routeProgressWithSlowdown(index / 100, differences, 0.1);
      expect(progress).toBeGreaterThanOrEqual(previous);
      previous = progress;
    }
    expect(routeProgressWithSlowdown(0.3, differences, 1)).toBe(0.3);
    expect(routeProgressWithSlowdown(0.3, [], 0.1)).toBe(0.3);
  });
});
