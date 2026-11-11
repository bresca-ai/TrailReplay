import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useTilePreload } from './useTilePreload';
it('waits for location boundaries before starting the initial camera fly-in', () => {
  const setAnimationPhase = vi.fn();
  const base = { allCoordinates: [[0, 0], [1, 1]], animationPhase: 'preloading' as const, cameraMode: 'overview' as const,
    elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapRef: { current: null as MapLibreMap | null },
    setAnimationPhase, smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000 };
  const { rerender } = renderHook(({ loading }) => useTilePreload({ ...base, locationBoundariesLoading: loading }), { initialProps: { loading: true } });
  expect(setAnimationPhase).not.toHaveBeenCalled();
  rerender({ loading: false }); expect(setAnimationPhase).toHaveBeenCalledWith('intro');
});
it('starts without scanning future views when the provider forbids prefetching', () => {
  const setAnimationPhase = vi.fn();
  const jumpTo = vi.fn();
  const { unmount } = renderHook(() => useTilePreload({
    allCoordinates: [[0, 0], [1, 1]], animationPhase: 'preloading', cameraMode: 'follow',
    elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true,
    mapRef: { current: { jumpTo } as unknown as MapLibreMap }, setAnimationPhase,
    smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000,
    skipPredictivePreload: true,
  }));
  expect(setAnimationPhase).toHaveBeenCalledWith('intro');
  expect(jumpTo).not.toHaveBeenCalled();
  unmount();
});
it('waits for the route-wide terrain plan before starting the aerial fly-in', () => {
  const setAnimationPhase = vi.fn();
  const base = { allCoordinates: [[0, 0], [1, 1]], animationPhase: 'preloading' as const, cameraMode: 'aerial-follow' as const,
    elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapRef: { current: null as MapLibreMap | null },
    setAnimationPhase, smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000 };
  const { rerender } = renderHook(({ loading }) => useTilePreload({ ...base, aerialTerrainLoading: loading }), { initialProps: { loading: true } });
  expect(setAnimationPhase).not.toHaveBeenCalled();
  rerender({ loading: false });
  expect(setAnimationPhase).toHaveBeenCalledWith('intro');
});
it('warms cinematic views with playback headroom and restores the original padding', () => {
  const original = { top: 10, bottom: 2, left: 3, right: 4 };
  const jumpTo = vi.fn();
  const map = { jumpTo, getPadding: () => original, getCanvas: () => ({ clientHeight: 500 }),
    cameraForBounds: () => ({ center: [0, 0], zoom: 5 }), once: vi.fn(), off: vi.fn() } as unknown as MapLibreMap;
  const { unmount } = renderHook(() => useTilePreload({
    allCoordinates: [[0, 0], [0.01, 0]], animationPhase: 'preloading', cameraMode: 'aerial-follow',
    elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapRef: { current: map },
    setAnimationPhase: vi.fn(), smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000,
  }));
  expect(jumpTo).toHaveBeenCalledWith(expect.objectContaining({ padding: { ...original, top: 90 } }));
  unmount();
  expect(jumpTo).toHaveBeenLastCalledWith(expect.objectContaining({ padding: original }));
});
it('warms the first playback view before the long zoom-in sequence', () => {
  const jumpTo = vi.fn();
  const map = { jumpTo, cameraForBounds: () => ({ center: [0, 0], zoom: 5 }),
    once: vi.fn(), off: vi.fn() } as unknown as MapLibreMap;
  const { unmount } = renderHook(() => useTilePreload({
    allCoordinates: [[0, 0], [0.01, 0]], animationPhase: 'preloading', cameraMode: 'follow',
    elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapRef: { current: map },
    setAnimationPhase: vi.fn(), smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000,
  }));
  expect(jumpTo.mock.calls[0][0].zoom).toBeGreaterThan(10);
  unmount();
});
it('keeps the opening covered until route-wide background warmup finishes', async () => {
  const { act } = await import('@testing-library/react');
  vi.useFakeTimers();
  try {
    const map = { jumpTo: vi.fn(), cameraForBounds: () => ({ center: [0, 0], zoom: 5 }),
      once: vi.fn(), off: vi.fn(), triggerRepaint: vi.fn() } as unknown as MapLibreMap;
    const setAnimationPhase = vi.fn();
    const backgroundWarmupReadyRef = { current: false };
    const { unmount } = renderHook(() => useTilePreload({
      allCoordinates: [[0, 0], [0.01, 0]], animationPhase: 'preloading', cameraMode: 'follow',
      elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapRef: { current: map },
      setAnimationPhase, smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000,
      backgroundWarmupReadyRef,
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(setAnimationPhase).not.toHaveBeenCalled();
    backgroundWarmupReadyRef.current = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(9250); });
    expect(setAnimationPhase).toHaveBeenCalledWith('intro');
    unmount();
  } finally { vi.useRealTimers(); }
});
it('waits for the restored place view before revealing the opening frame', async () => {
  const { act } = await import('@testing-library/react');
  vi.useFakeTimers();
  try {
    const listeners = new Map<string, () => void>();
    const map = { jumpTo: vi.fn(), cameraForBounds: () => ({ center: [0, 0], zoom: 5 }),
      once: (event: string, handler: () => void) => listeners.set(event, handler),
      off: (event: string) => listeners.delete(event), triggerRepaint: vi.fn() } as unknown as MapLibreMap;
    const setAnimationPhase = vi.fn();
    const base = { allCoordinates: [[0, 0], [1, 1]], animationPhase: 'preloading' as const, cameraMode: 'follow' as const,
      elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapRef: { current: map },
      setAnimationPhase, smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000,
      introStartOverride: { center: [0, 0] as [number, number], zoom: 5, pitch: 0, bearing: 0 } };
    const { unmount } = renderHook(() => useTilePreload(base));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(setAnimationPhase).not.toHaveBeenCalled();
    expect(map.triggerRepaint).toHaveBeenCalled();
    act(() => listeners.get('idle')?.());
    expect(setAnimationPhase).toHaveBeenCalledWith('intro');
    unmount();
  } finally { vi.useRealTimers(); }
});
it('also waits for the normal restored overview before revealing the intro', async () => {
  const { act } = await import('@testing-library/react');
  vi.useFakeTimers();
  try {
    const listeners = new Map<string, () => void>();
    const map = { jumpTo: vi.fn(), cameraForBounds: () => ({ center: [0, 0], zoom: 5 }),
      once: (event: string, handler: () => void) => listeners.set(event, handler),
      off: (event: string) => listeners.delete(event), triggerRepaint: vi.fn() } as unknown as MapLibreMap;
    const setAnimationPhase = vi.fn();
    const { unmount } = renderHook(() => useTilePreload({
      allCoordinates: [[0, 0], [1, 1]], animationPhase: 'preloading', cameraMode: 'follow',
      elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapRef: { current: map },
      setAnimationPhase, smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000,
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(setAnimationPhase).not.toHaveBeenCalled();
    expect(map.triggerRepaint).toHaveBeenCalled();
    act(() => listeners.get('idle')?.());
    expect(setAnimationPhase).toHaveBeenCalledWith('intro');
    unmount();
  } finally { vi.useRealTimers(); }
});
