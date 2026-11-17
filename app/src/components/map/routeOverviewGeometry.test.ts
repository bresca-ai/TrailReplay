import { expect, it } from 'vitest';
import { buildJourneyOverviewRoutes, buildRouteOverviewGeometry, projectRouteOverviewProgress, routeOverviewColors } from './routeOverviewGeometry';
import type { ComputedJourney } from '@/utils/journeyUtils';

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

it('keeps every turn in long routes for both the full and completed paths', () => {
  const route = Array.from({ length: 1501 }, (_, index) => [index, index % 2]);
  const project = (lon: number, lat: number) => ({ x: lon, y: lat });
  const full = projectRouteOverviewProgress(route, project);
  const completed = projectRouteOverviewProgress(route.slice(0, 1000), project);
  expect(full).toHaveLength(1501);
  expect(completed).toEqual(full.slice(0, 1000));
  expect(full[1]).toEqual({ x: 1, y: 1 });
});

it('uses light and dark shades of the selected route color', () => {
  expect(routeOverviewColors('#ff0000')).toEqual({ remaining: 'rgb(255, 140, 140)', completed: 'rgb(184, 0, 0)' });
  expect(routeOverviewColors('#36c')).toEqual(routeOverviewColors('#3366cc'));
});

it('keeps routes separate with their own colors and follows the current route when requested', () => {
  const journey = {
    coordinates: [{ lon: 1, lat: 1 }, { lon: 2, lat: 2 }, { lon: 3, lat: 3 }, { lon: 4, lat: 4 }, { lon: 5, lat: 5 }, { lon: 6, lat: 6 }],
    segmentTimings: [
      { segmentId: 'a', segmentIndex: 0, type: 'track', startCoordIndex: 0, endCoordIndex: 1, color: '#ff0000' },
      { segmentId: 'transport', segmentIndex: 1, type: 'transport', startCoordIndex: 2, endCoordIndex: 3 },
      { segmentId: 'b', segmentIndex: 2, type: 'track', startCoordIndex: 4, endCoordIndex: 5, color: '#0000ff' },
    ],
  } as unknown as ComputedJourney;
  const completed = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [5.5, 5.5]];
  const routes = buildJourneyOverviewRoutes(journey, completed, journey.segmentTimings[2], { lon: 5.5, lat: 5.5 }, '#000', false);
  expect(routes.map((route) => [route.id, route.color, route.coordinates])).toEqual([
    ['a', '#ff0000', [[1, 1], [2, 2]]],
    ['b', '#0000ff', [[5, 5], [6, 6]]],
  ]);
  expect(routes[1].completed).toEqual([[5, 5], [5.5, 5.5]]);
  expect(buildJourneyOverviewRoutes(journey, completed, journey.segmentTimings[2], null, '#000', true).map((route) => route.id)).toEqual(['b']);
  expect(buildJourneyOverviewRoutes(journey, completed, journey.segmentTimings[1], null, '#000', true).map((route) => route.id)).toEqual(['a']);
});
