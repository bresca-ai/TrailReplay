import { describe, expect, it } from 'vitest';
import { buildElevatedSegments, completedRouteIndex, terrainSafeElevation, type ElevationPoint, type ElevationStyle } from './recordedElevationGeometry';

const points: ElevationPoint[] = [
  { lat: 0, lon: 0, elevation: 100, heartRate: 100 },
  { lat: 0, lon: 0.001, elevation: 200, heartRate: 170 },
  { lat: 0, lon: 0.002, elevation: 300, heartRate: 160 },
];
const style: ElevationStyle = { colorMode: 'fixed', trailColor: '#ff00ff', colorZones: [], segmentTimings: [] };

describe('recorded-elevation geometry', () => {
  it('clips completed color at the interpolated marker, including exact and duplicate endpoints', () => {
    expect(completedRouteIndex(points, [[0, 0], [0.00025, 0]], { lat: 0, lon: 0.00025, elevation: 125 })).toBeCloseTo(0.25);
    expect(completedRouteIndex(points, [[0, 0], [0.001, 0], [0.001, 0]], points[1])).toBe(1);
    expect(completedRouteIndex(points, [[0, 0]], points[1])).toBe(1);
    expect(completedRouteIndex(points, [], points[0])).toBe(-1);
  });
  it('matches fixed, zone boundaries and heart-rate colors', () => {
    const fixed = buildElevatedSegments(points, style, () => null);
    expect(fixed.every(s => s.color === '#ff00ff')).toBe(true);
    const zones = buildElevatedSegments(points, { ...style, colorMode: 'zones', colorZones: [{ id: 'a', fromProgress: 0.2, toProgress: 0.65, color: '#00ff00' }] }, () => null);
    expect(zones.some(s => s.fromIndex === 0.4 && s.color === '#00ff00')).toBe(true);
    expect(zones.some(s => s.fromIndex === 1.3 && s.color === '#ff00ff')).toBe(true);
    const heart = buildElevatedSegments(points, { ...style, colorMode: 'heartRate' }, () => null);
    expect(heart.find(s => s.fromIndex === 0)?.color).not.toEqual(heart.find(s => s.fromIndex === 1)?.color);
  });
  it('raises below-terrain points and samples between distant points to avoid terrain crossings', () => {
    expect(terrainSafeElevation(points[0], () => 150)).toBe(151);
    expect(terrainSafeElevation(points[0], () => 50)).toBe(100);
    expect(terrainSafeElevation(points[0], () => null)).toBe(100);
    const segments = buildElevatedSegments(points.slice(0, 2), style, lon => lon > 0.0004 && lon < 0.0006 ? 500 : 10);
    expect(segments.length).toBeGreaterThan(2);
    expect(segments.some(s => s.start.elevation === 501)).toBe(true);
  });
});
