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
vi.mock('./CinematicOrbitBall', () => ({ CinematicOrbitBall: () => <div /> }));

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
