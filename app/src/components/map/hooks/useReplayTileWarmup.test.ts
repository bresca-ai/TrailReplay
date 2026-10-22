import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOOP_TILE_PRELOAD_OBSERVER } from '@/utils/tilePreloadObserver';
import { useReplayTileWarmup } from './useReplayTileWarmup';

const { MapConstructor, map } = vi.hoisted(() => {
  const map = {
    on: vi.fn(), off: vi.fn(), once: vi.fn(), remove: vi.fn(),
    isStyleLoaded: () => false, loaded: vi.fn(() => false), jumpTo: vi.fn(),
  };
  return { map, MapConstructor: vi.fn(function () { return map; }) };
});
vi.mock('maplibre-gl', () => ({ Map: MapConstructor }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  map.loaded.mockReturnValue(false);
});

describe('replay tile warmup camera', () => {
  it('predicts the full cinematic pitch without rendering an invisible Retina canvas', () => {
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
      playbackProgress: 0,
      playbackSpeed: 1,
      totalDurationMs: 95000,
    }));

    expect(MapConstructor).toHaveBeenCalledWith(expect.objectContaining({ maxPitch: 85, pixelRatio: 1 }));
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

});
