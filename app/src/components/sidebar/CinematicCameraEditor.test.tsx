import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useAppStore } from '@/store/useAppStore';
import { mapGlobalRef } from '@/utils/mapRef';
import { registerAerialTerrainPlan, unregisterAerialTerrainPlan } from '@/utils/aerialTerrainPlan';
import { CinematicCameraEditor } from './CinematicCameraEditor';

const route = vi.hoisted(() => [[0, 0], [0.01, 0]]);
vi.mock('@/hooks/useComputedJourney', () => ({ useComputedJourney: () => ({
  computedJourney: null,
  currentPosition: { lon: 0.005, lat: 0, elevation: 0 },
  currentSegment: null,
  cameraPathCoordinates: route,
  elevationData: [],
}) }));
vi.mock('@/hooks/useCinematicCameraKeyframes', () => ({ usePreparedCinematicCameraKeyframes: () => [] }));
vi.mock('./CinematicOrbitBall', () => ({ CinematicOrbitBall: ({ bearingDeg, pitchDeg }: { bearingDeg: number; pitchDeg: number }) => <div data-testid="orbit-pose">{bearingDeg},{pitchDeg}</div> }));

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.setState(state => ({ animationPhase: 'playing', playback: { ...state.playback, isPlaying: true, progress: 0.5 } }));
});

it('uses the terrain-aware flight when seeking after pause', async () => {
  const jumpTo = vi.fn();
  mapGlobalRef.current = { getBearing: () => 120, getPitch: () => 68, getZoom: () => 14.5, jumpTo } as unknown as MapLibreMap;
  const plan = Promise.resolve([10, 20]);
  registerAerialTerrainPlan(route, plan);
  await plan;
  render(<CinematicCameraEditor />);
  act(() => useAppStore.setState(state => ({ playback: { ...state.playback, isPlaying: false } })));
  act(() => useAppStore.setState(state => ({ playback: { ...state.playback, progress: 0.75 } })));
  expect(jumpTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: 17.5 }));
  unregisterAerialTerrainPlan(route, plan);
});
afterEach(() => { cleanup(); mapGlobalRef.current = null; });

it('shows the keyboard shortcuts beside the camera control and explains both direction modes', () => {
  const { container, getByText } = render(<CinematicCameraEditor />);
  expect(Array.from(container.querySelectorAll('kbd')).map((key) => key.textContent))
    .toEqual(['Space', 'A', 'D', 'W', 'S', 'R', 'F', 'Enter']);
  expect(getByText(/stays behind as the route bends/i)).toBeTruthy();
  expect(getByText(/does not stay in one place/i)).toBeTruthy();
});

it('keeps the actual flight view on pause and lets a deliberate camera edit move it', () => {
  const jumpTo = vi.fn();
  mapGlobalRef.current = { getBearing: () => 120, getPitch: () => 68, getZoom: () => 14.5, jumpTo } as unknown as MapLibreMap;
  render(<CinematicCameraEditor />);
  expect(jumpTo).not.toHaveBeenCalled();
  act(() => useAppStore.setState(state => ({ playback: { ...state.playback, isPlaying: false } })));
  expect(jumpTo).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'd' });
  expect(jumpTo).toHaveBeenCalledWith(expect.objectContaining({ bearing: expect.any(Number), pitch: 68, zoom: 14.5 }));
});


it('shows the actual animated map pose without moving the map', () => {
  const jumpTo = vi.fn();
  mapGlobalRef.current = { getBearing: () => 120, getPitch: () => 68, getZoom: () => 14.5, jumpTo } as unknown as MapLibreMap;
  const { getByTestId } = render(<CinematicCameraEditor />);
  act(() => useAppStore.getState().setCameraPosition({ lat: 0, lon: 0, zoom: 14, bearing: 32, pitch: 61 }));
  expect(getByTestId('orbit-pose').textContent).toBe('32,61');
  act(() => useAppStore.getState().setCameraPosition({ lat: 0, lon: 0, zoom: 14, bearing: 145, pitch: 48 }));
  expect(getByTestId('orbit-pose').textContent).toBe('145,48');
  expect(jumpTo).not.toHaveBeenCalled();
});


it('normalizes negative map bearings on pause so the direction slider does not jump', () => {
  const jumpTo = vi.fn();
  mapGlobalRef.current = { getBearing: () => -121, getPitch: () => 70, getZoom: () => 15, jumpTo } as unknown as MapLibreMap;
  const { getByTestId } = render(<CinematicCameraEditor />);
  act(() => useAppStore.setState(state => ({ playback: { ...state.playback, isPlaying: false } })));
  expect(getByTestId('orbit-pose').textContent).toBe('239,70');
  fireEvent.keyDown(window, { key: 'd' });
  expect(jumpTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: 244, pitch: 70 }));
});
