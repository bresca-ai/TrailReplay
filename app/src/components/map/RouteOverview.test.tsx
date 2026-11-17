import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import type { ComparisonTrack, GPXTrack } from '@/types';
import { RouteOverview } from './RouteOverview';
import { buildRouteOverviewGeometry } from './routeOverviewGeometry';

const journeyState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/hooks/useComputedJourney', () => ({ useComputedJourney: () => journeyState.current }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('draws each route in its own color, and only the current route in per-route mode', () => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ showRouteOverview: true });
  const timings = [
    { segmentId: 'a', trackId: 'track-a', segmentIndex: 0, type: 'track', startCoordIndex: 0, endCoordIndex: 1, color: '#ff0000' },
    { segmentId: 'b', trackId: 'track-b', segmentIndex: 1, type: 'track', startCoordIndex: 2, endCoordIndex: 3, color: '#0000ff' },
  ];
  useAppStore.setState({ comparisonTracks: [{ id: 'compare', groupId: 'track-b', visible: true, color: '#00ff00',
    track: { points: [{ lon: 3.1, lat: 3 }, { lon: 4.1, lat: 4 }] } } as unknown as ComparisonTrack] });
  journeyState.current = {
    computedJourney: { coordinates: [{ lon: 1, lat: 1 }, { lon: 2, lat: 2 }, { lon: 3, lat: 3 }, { lon: 4, lat: 4 }], segmentTimings: timings },
    currentSegment: { segment: timings[1] }, currentPosition: { lon: 3.5, lat: 3.5 },
    completedCoordinates: [[1, 1], [2, 2], [3, 3], [3.5, 3.5]], allCoordinates: [],
  };
  const colors: string[] = [];
  const ctx = { scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), lineJoin: '', lineCap: '', strokeStyle: '', lineWidth: 0,
    stroke() { colors.push(this.strokeStyle); } };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  const { rerender } = render(<RouteOverview containerSize={{ width: 800, height: 600 }} frame={null} />);
  expect(colors).toContain('rgb(255, 140, 140)');
  expect(colors).toContain('rgb(140, 140, 255)');
  expect(colors).toContain('rgb(140, 255, 140)');
  expect(colors.at(-2)).toBe('rgb(0, 0, 184)');
  const geometry = buildRouteOverviewGeometry([[1, 1], [2, 2], [3, 3], [4, 4], [3.1, 3], [4.1, 4]], 200, 144)!;
  const initial = geometry.project(3.5, 3.5);
  expect(ctx.arc).toHaveBeenLastCalledWith(initial.x, initial.y, 3, 0, 2 * Math.PI);
  colors.length = 0;
  journeyState.current = { ...journeyState.current, currentSegment: { segment: timings[0] },
    currentPosition: { lon: 1.5, lat: 1.5 }, completedCoordinates: [[1, 1], [1.5, 1.5]] };
  rerender(<RouteOverview containerSize={{ width: 800, height: 600 }} frame={null} />);
  expect(colors.at(-2)).toBe('rgb(184, 0, 0)');
  const moved = geometry.project(1.5, 1.5);
  expect(ctx.arc).toHaveBeenLastCalledWith(moved.x, moved.y, 3, 0, 2 * Math.PI);
  colors.length = 0;
  journeyState.current = { ...journeyState.current, currentSegment: { segment: timings[1] },
    currentPosition: { lon: 3.5, lat: 3.5 }, completedCoordinates: [[1, 1], [2, 2], [3, 3], [3.5, 3.5]] };
  act(() => useAppStore.getState().setSettings({ routeOverviewPerRoute: true }));
  expect(colors).not.toContain('rgb(255, 140, 140)');
  expect(colors).toContain('rgb(140, 140, 255)');
  expect(colors).not.toContain('rgb(140, 255, 140)');
  ctx.arc.mockClear();
  act(() => useAppStore.getState().setIsExporting(true));
  expect(ctx.arc).toHaveBeenCalled();
});

it('paints comparison route progress at the same time as the main map', () => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ showRouteOverview: true });
  const primary = { id: 'primary', color: '#ff0000', points: [] } as unknown as GPXTrack;
  const comparison = { id: 'compare', groupId: 'primary', visible: true, color: '#00ff00',
    track: { points: [{ lon: 1, lat: 1, distance: 0, time: new Date(0) }, { lon: 2, lat: 2, distance: 100, time: new Date(10000) }] } } as unknown as ComparisonTrack;
  useAppStore.setState({ comparisonTracks: [comparison], comparisonMode: 'time' });
  journeyState.current = { computedJourney: null, activeTrack: primary, currentPosition: { lon: 1.5, lat: 1.5, time: new Date(5000) },
    completedCoordinates: [[1, 1], [1.5, 1.5]], allCoordinates: [[1, 1], [2, 2]] };
  const colors: string[] = [];
  const ctx = { scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), lineJoin: '', lineCap: '', strokeStyle: '', lineWidth: 0,
    stroke() { colors.push(this.strokeStyle); } };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  render(<RouteOverview containerSize={{ width: 800, height: 600 }} frame={null} />);
  expect(colors).toContain('rgb(0, 184, 0)');
});

it('keeps the position visible during a connection between routes', () => {
  useAppStore.getState().reset();
  useAppStore.getState().setSettings({ showRouteOverview: true, routeOverviewPerRoute: true });
  const segments = [
    { segmentId: 'a', segmentIndex: 0, type: 'track', startCoordIndex: 0, endCoordIndex: 1, color: '#ff0000' },
    { segmentId: 'connection', segmentIndex: 1, type: 'transport', startCoordIndex: 2, endCoordIndex: 3 },
    { segmentId: 'b', segmentIndex: 2, type: 'track', startCoordIndex: 4, endCoordIndex: 5, color: '#0000ff' },
  ];
  journeyState.current = { computedJourney: { coordinates: [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 0 },
    { lon: 10, lat: 0 }, { lon: 10, lat: 0 }, { lon: 11, lat: 0 }], segmentTimings: segments },
  currentSegment: { segment: segments[1] }, currentPosition: { lon: 8, lat: 0 }, completedCoordinates: [], allCoordinates: [] };
  const ctx = { scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  render(<RouteOverview containerSize={{ width: 800, height: 600 }} frame={null} />);
  expect(ctx.arc).toHaveBeenCalledOnce();
  const [x, y] = ctx.arc.mock.calls[0] as unknown as [number, number];
  expect(x).toBeGreaterThanOrEqual(18);
  expect(x).toBeLessThanOrEqual(182);
  expect(y).toBeGreaterThanOrEqual(18);
  expect(y).toBeLessThanOrEqual(126);
});
