import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import type { ComparisonTrack } from '@/types';
import { RouteOverview } from './RouteOverview';

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
  const ctx = { scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), lineJoin: '', lineCap: '', strokeStyle: '', lineWidth: 0,
    stroke() { colors.push(this.strokeStyle); } };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  const { rerender } = render(<RouteOverview containerSize={{ width: 800, height: 600 }} frame={null} />);
  expect(colors).toContain('rgb(255, 140, 140)');
  expect(colors).toContain('rgb(140, 140, 255)');
  expect(colors).toContain('rgb(140, 255, 140)');
  expect(colors.at(-1)).toBe('rgb(0, 0, 184)');
  colors.length = 0;
  journeyState.current = { ...journeyState.current, currentSegment: { segment: timings[0] },
    currentPosition: { lon: 1.5, lat: 1.5 }, completedCoordinates: [[1, 1], [1.5, 1.5]] };
  rerender(<RouteOverview containerSize={{ width: 800, height: 600 }} frame={null} />);
  expect(colors.at(-1)).toBe('rgb(184, 0, 0)');
  colors.length = 0;
  journeyState.current = { ...journeyState.current, currentSegment: { segment: timings[1] },
    currentPosition: { lon: 3.5, lat: 3.5 }, completedCoordinates: [[1, 1], [2, 2], [3, 3], [3.5, 3.5]] };
  act(() => useAppStore.getState().setSettings({ routeOverviewPerRoute: true }));
  expect(colors).not.toContain('rgb(255, 140, 140)');
  expect(colors).toContain('rgb(140, 140, 255)');
  expect(colors).not.toContain('rgb(140, 255, 140)');
});
