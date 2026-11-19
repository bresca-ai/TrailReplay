import { describe, expect, it } from 'vitest';
import { markerRouteHeading } from './markerRouteHeading';

describe('markerRouteHeading', () => {
  it('keeps facing the current segment until the painted tip reaches a right-angle turn', () => {
    const completed = [[0, 0], [1, 0], [1, 1]];
    expect(markerRouteHeading(completed, [0.95, 0])).toBeCloseTo(90, 4);
    expect(markerRouteHeading(completed, [1, 0.05])).toBeCloseTo(0, 4);
  });
  it('uses the latest overlapping segment and skips duplicate points', () => {
    const route = [[0, 0], [1, 0], [1, 1], [1, 0], [0, 0], [0, 0]];
    expect(markerRouteHeading(route, [0.5, 0])).toBeCloseTo(270, 4);
    expect(markerRouteHeading([[0, 0], [0, 0]], [0, 0])).toBeNull();
    expect(markerRouteHeading(route, null)).toBeNull();
  });
});
