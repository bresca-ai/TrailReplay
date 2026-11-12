import { expect, it } from 'vitest';
import { buildRouteOverviewGeometry, projectRouteOverviewProgress, routeOverviewColors } from './routeOverviewGeometry';

it('fits the route and the current position inside the inset without stretching', () => {
  const geometry = buildRouteOverviewGeometry([[2, 41], [2.02, 41.01], [2.04, 41.02]], 200, 144)!;
  expect(geometry.path).toHaveLength(3);
  for (const point of geometry.path) {
    expect(point.x).toBeGreaterThanOrEqual(17.999);
    expect(point.x).toBeLessThanOrEqual(182);
    expect(point.y).toBeGreaterThanOrEqual(17.999);
    expect(point.y).toBeLessThanOrEqual(126.001);
  }
  expect(geometry.project(2.02, 41.01)).toEqual(geometry.path[1]);
});

it('keeps routes across the date line compact', () => {
  const geometry = buildRouteOverviewGeometry([[179.9, 10], [-179.9, 10.1]], 200, 144)!;
  const midpoint = geometry.project(180, 10.05);
  expect(midpoint.x).toBeCloseTo(100);
  expect(midpoint.y).toBeCloseTo(72);
});


it('projects the completed route through its interpolated current point', () => {
  const geometry = buildRouteOverviewGeometry([[2, 41], [2.02, 41.01], [2.04, 41.02]], 200, 144)!;
  const completed = projectRouteOverviewProgress([[2, 41], [2.015, 41.0075]], geometry.project);
  expect(completed).toHaveLength(2);
  expect(completed[1]).toEqual(geometry.project(2.015, 41.0075));
  expect(projectRouteOverviewProgress([], geometry.project)).toEqual([]);
});

it('uses light and dark shades of the selected route color', () => {
  expect(routeOverviewColors('#ff0000')).toEqual({ remaining: 'rgb(255, 140, 140)', completed: 'rgb(184, 0, 0)' });
  expect(routeOverviewColors('#36c')).toEqual(routeOverviewColors('#3366cc'));
});
