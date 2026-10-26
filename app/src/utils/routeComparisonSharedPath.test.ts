import { describe, expect, it } from 'vitest';
import { parseGPX } from './gpxParser';
import { areFollowingSamePath } from './routeComparisonSharedPath';

function track(points: Array<[number, number, number]>) {
  const base = parseGPX('<gpx><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.01"/></trkseg></trk></gpx>', 'route.gpx');
  return { ...base, totalDistance: points.at(-1)![2], points: points.map(([x, y, distance]) => ({ ...base.points[0], lat: y / 111320, lon: x / 111320, distance, time: null })) };
}

describe('shared route comparison path', () => {
  it('recognizes a shared line despite different GPX sample spacing', () => {
    const primary = track([[0, 0, 0], [300, 0, 300]]);
    const comparison = track([[0, 0, 0], [100, 0, 100], [200, 0, 200], [300, 0, 300]]);
    expect(areFollowingSamePath(primary, comparison, 150)).toBe(true);
  });

  it('keeps one marker through small GPS offsets below the highlighted split threshold', () => {
    const primary = track([[0, 0, 0], [500, 0, 500]]);
    const comparison = track([[0, 0, 0], [100, 20, 102], [250, 28, 254], [400, 20, 406], [500, 0, 508]]);
    for (const distance of [0, 100, 250, 400, 500]) expect(areFollowingSamePath(primary, comparison, distance)).toBe(true);
  });

  it('shows separate markers for the full highlighted branch, including its under-30 m shoulders', () => {
    const primary = track([[0, 0, 0], [700, 0, 700]]);
    const comparison = track([
      [0, 0, 0], [100, 0, 100], [200, 0, 200], [300, 10, 300],
      [400, 40, 400], [500, 10, 500], [600, 0, 600], [700, 0, 700],
    ]);
    expect(areFollowingSamePath(primary, comparison, 150)).toBe(true);
    expect(areFollowingSamePath(primary, comparison, 350)).toBe(false);
    expect(areFollowingSamePath(primary, comparison, 450)).toBe(false);
    expect(areFollowingSamePath(primary, comparison, 650)).toBe(true);
  });

  it('does not mistake a crossing for a shared section of the route', () => {
    const primary = track([[0, 0, 0], [300, 0, 300]]);
    const crossing = track([[0, -50, 0], [150, 0, 158], [300, 50, 316]]);
    expect(areFollowingSamePath(primary, crossing, 150)).toBe(false);
  });
});
