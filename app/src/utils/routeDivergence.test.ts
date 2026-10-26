import { describe, expect, it } from 'vitest';
import { buildRouteDivergences } from './routeDivergence';

const point = (x: number, y: number, distance: number) => ({ lat: y / 111320, lon: x / 111320, distance });

describe('route divergence geometry', () => {
  it('matches a densely sampled route to the same sparsely sampled line', () => {
    const primary = [point(0, 0, 0), point(1000, 0, 1000)];
    const comparison = Array.from({ length: 101 }, (_, index) => point(index * 10, 0, index * 10));
    expect(buildRouteDivergences(primary, comparison).features).toEqual([]);
  });

  it('marks a detour with a continuous line and its two boundaries', () => {
    const primary = [point(0, 0, 0), point(1000, 0, 1000)];
    const comparison = [point(0, 0, 0), point(250, 0, 250), point(500, 150, 550), point(750, 0, 850), point(1000, 0, 1100)];
    const features = buildRouteDivergences(primary, comparison).features;
    expect(features.map((feature) => feature.geometry.type)).toEqual(['LineString', 'Point', 'Point']);
    expect(features[0].geometry).toMatchObject({ coordinates: comparison.slice(1, 4).map((entry) => [entry.lon, entry.lat]) });
  });

  it('ignores lateral GPS differences inside the threshold', () => {
    const primary = [point(0, 0, 0), point(1000, 0, 1000)];
    const comparison = [point(0, 20, 0), point(500, 25, 500), point(1000, 20, 1000)];
    expect(buildRouteDivergences(primary, comparison).features).toEqual([]);
  });

  it('colors the entire fork once any part separates by more than 30 m', () => {
    const primary = [point(0, 0, 0), point(700, 0, 700)];
    const comparison = [
      point(0, 0, 0), point(100, 10, 100), point(200, 20, 200),
      point(300, 30, 300), point(400, 40, 400), point(500, 20, 500),
      point(600, 10, 600), point(700, 0, 700),
    ];
    const features = buildRouteDivergences(primary, comparison).features;
    expect(features.map((feature) => feature.geometry.type)).toEqual(['LineString', 'Point', 'Point']);
    expect(features[0].geometry).toMatchObject({ coordinates: comparison.map(({ lon, lat }) => [lon, lat]) });
    expect(features[0].properties).toMatchObject({ startDistance: 0, endDistance: 700 });
  });

  it('does not color a fork that reaches exactly 30 m but never exceeds it', () => {
    const primary = [point(0, 0, 0), point(400, 0, 400)];
    const comparison = [point(0, 0, 0), point(100, 10, 100), point(200, 30, 200), point(300, 10, 300), point(400, 0, 400)];
    expect(buildRouteDivergences(primary, comparison).features).toEqual([]);
  });
});
