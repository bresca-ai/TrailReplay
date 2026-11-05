import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { NOOP_TILE_PRELOAD_OBSERVER } from '@/utils/tilePreloadObserver';
import { useReplayTileWarmup } from './useReplayTileWarmup';

const { MapConstructor, map } = vi.hoisted(() => {
  const map = {
    on: vi.fn(), off: vi.fn(), once: vi.fn(), remove: vi.fn(),
    isStyleLoaded: () => false, loaded: vi.fn(() => false), jumpTo: vi.fn(),
  };
  return { map, MapConstructor: vi.fn(function (options?: Record<string, unknown>) { return { ...map, options }; }) };
});
vi.mock('maplibre-gl', () => ({ Map: MapConstructor }));
vi.mock('./useLocationChapters', () => ({ cameraForPlace: () => ({ center: [1.84, 41.59], zoom: 5, pitch: 0, bearing: 0 }) }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', vi.fn(function () {
    return { observe: vi.fn(), disconnect: vi.fn() };
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  map.loaded.mockReturnValue(false);
});

describe('replay tile warmup camera', () => {
  it('predicts the full cinematic pitch without rendering an invisible Retina canvas', () => {
    const visible = document.createElement('div');
    Object.defineProperties(visible, { clientWidth: { value: 1118 }, clientHeight: { value: 575 } });
    const { unmount } = renderHook(() => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58]],
      animationPhase: 'idle',
      cameraMode: 'cinematic',
      cinematicKeyframes: [],
      diagnostics: NOOP_TILE_PRELOAD_OBSERVER,
      elevationData: [],
      enabled: true,
      followBehindZoomLevel: 33,
      isMapLoaded: true,
      isPlaying: false,
      mapStyle: 'satellite',
      visibleMapRef: { current: { getContainer: () => visible } as unknown as MapLibreMap },
      playbackProgress: 0,
      playbackSpeed: 1,
      totalDurationMs: 95000,
    }));

    expect(MapConstructor).toHaveBeenCalledWith(expect.objectContaining({ maxPitch: 85, pixelRatio: 1 }));
    const options = MapConstructor.mock.calls[0][0];
    expect(options?.style).not.toHaveProperty('terrain');
    expect(options?.container).toHaveStyle({ width: '1118px', height: '575px' });
    expect(options?.maxTileCacheSize).toBe(256);
    unmount();
    expect(map.remove).toHaveBeenCalledOnce();
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('advances prediction after one discovery render without waiting the full timeout', async () => {
    map.loaded.mockReturnValue(true);
    const { unmount } = renderHook(() => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58], [1.85, 41.60]],
      animationPhase: 'playing',
      cameraMode: 'follow',
      diagnostics: NOOP_TILE_PRELOAD_OBSERVER,
      elevationData: [],
      enabled: true,
      followBehindZoomLevel: 33,
      isMapLoaded: true,
      isPlaying: true,
      mapStyle: 'satellite',
      visibleMapRef: { current: null },
      playbackProgress: 0,
      playbackSpeed: 1,
      totalDurationMs: 95000,
    }));
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    const renderListener = map.once.mock.calls.find(([event]) => event === 'render')?.[1];
    expect(renderListener).toEqual(expect.any(Function));
    await act(async () => { renderListener(); });
    expect(map.jumpTo).toHaveBeenCalledTimes(2);
    unmount();
    expect(map.off).toHaveBeenCalledWith('render', renderListener);
  });

  it('requests the zoom path to an upcoming place overview', async () => {
    map.loaded.mockReturnValue(true);
    const feature = { type: 'Feature' as const, properties: { id: 'place', name: 'Place', iso3: 'ESP', credit: 'source' },
      geometry: { type: 'Polygon' as const, coordinates: [[[1, 41], [2, 41], [2, 42], [1, 42], [1, 41]]] } };
    const { unmount } = renderHook(() => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58], [1.85, 41.60]], animationPhase: 'playing', cameraMode: 'follow',
      diagnostics: NOOP_TILE_PRELOAD_OBSERVER, elevationData: [], enabled: true, followBehindZoomLevel: 33,
      isMapLoaded: true, isPlaying: true, mapStyle: 'satellite', visibleMapRef: { current: null },
      playbackProgress: 0, playbackSpeed: 1, totalDurationMs: 95000, locationFeatures: [feature], zoomToPlace: true,
    }));
    for (let i = 0; i < 12; i++) {
      const calls = map.once.mock.calls.filter(([event]) => event === 'render');
      const listener = calls[calls.length - 1]?.[1];
      await act(async () => { listener?.(); });
    }
    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 5, pitch: 0 }));
    unmount();
  });

});
