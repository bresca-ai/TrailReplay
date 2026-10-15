import { describe, expect, it } from 'vitest';
import {
  downsampleRoute,
  fitRouteToBox,
  getMapPanTargetPoint,
  getMapZoomForScale,
  getRouteBboxNorm,
} from './socialShareRouteFit';

describe('fitRouteToBox', () => {
  const box = { x: 0, y: 0, w: 200, h: 200 };
  const transform = { offsetX: 0, offsetY: 0, scale: 1 };

  it('centers the route midpoint in the box', () => {
    const pts = [{ lat: 41.0, lon: 2.0 }, { lat: 41.1, lon: 2.1 }];
    const [a, b] = fitRouteToBox(pts, box, transform);
    expect((a.x + b.x) / 2).toBeCloseTo(100, 0);
    expect((a.y + b.y) / 2).toBeCloseTo(100, 0);
  });

  it('flips latitude: higher lat maps to lower canvas y', () => {
    const [south, north] = fitRouteToBox(
      [{ lat: 41.0, lon: 2.0 }, { lat: 41.1, lon: 2.0 }],
      box, transform,
    );
    expect(north.y).toBeLessThan(south.y);
  });

  it('applies user scale: span doubles when scale doubles', () => {
    const pts = [{ lat: 41.0, lon: 2.0 }, { lat: 41.1, lon: 2.1 }];
    const [a1, b1] = fitRouteToBox(pts, box, { ...transform, scale: 1 });
    const [a2, b2] = fitRouteToBox(pts, box, { ...transform, scale: 2 });
    const span1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
    const span2 = Math.hypot(b2.x - a2.x, b2.y - a2.y);
    expect(span2).toBeCloseTo(span1 * 2, 0);
  });

  it('applies offset to the centroid', () => {
    const pts = [{ lat: 41.0, lon: 2.0 }, { lat: 41.1, lon: 2.1 }];
    const [a, b] = fitRouteToBox(pts, box, { ...transform, offsetX: 20, offsetY: -10 });
    expect((a.x + b.x) / 2).toBeCloseTo(120, 0);
    expect((a.y + b.y) / 2).toBeCloseTo(90, 0);
  });
});

describe('downsampleRoute', () => {
  it('returns the original array when under the limit', () => {
    expect(downsampleRoute([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('returns exactly maxN points when over the limit', () => {
    expect(downsampleRoute(Array.from({ length: 100 }, (_, i) => i), 10)).toHaveLength(10);
  });

  it('always includes the first element', () => {
    const pts = Array.from({ length: 50 }, (_, i) => i);
    expect(downsampleRoute(pts, 5)[0]).toBe(0);
  });
});

describe('getRouteBboxNorm', () => {
  it('returns normalized bounds with padding for preview controls', () => {
    expect(getRouteBboxNorm([{ x: 20, y: 40 }, { x: 80, y: 60 }], 200, 100, 10))
      .toEqual({ x: 0.05, y: 0.3, w: 0.4, h: 0.4 });
  });
});

describe('map-first route gestures', () => {
  it('moves the map center opposite the drag so the route follows the pointer', () => {
    expect(getMapPanTargetPoint({ x: 300, y: 200 }, 0.1, -0.2, 500, 400))
      .toEqual({ x: 250, y: 280 });
  });

  it('converts route scale into map zoom and respects zoom limits', () => {
    expect(getMapZoomForScale(10, 2, 0, 20)).toBe(11);
    expect(getMapZoomForScale(10, 0.5, 0, 20)).toBe(9);
    expect(getMapZoomForScale(19.5, 4, 0, 20)).toBe(20);
  });
});
