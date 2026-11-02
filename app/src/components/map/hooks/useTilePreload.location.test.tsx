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
