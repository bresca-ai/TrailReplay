import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { useTilePreload } from './useTilePreload';
it('waits for location boundaries before starting the initial camera fly-in', () => {
  const setAnimationPhase = vi.fn();
  const base = { allCoordinates: [[0, 0], [1, 1]], animationPhase: 'preloading' as const, cameraMode: 'overview' as const,
    elevationData: [], followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapRef: { current: null as Map | null },
    setAnimationPhase, smoothBearingRef: { current: 0 }, targetBearingRef: { current: 0 }, totalDurationMs: 60000 };
  const { rerender } = renderHook(({ loading }) => useTilePreload({ ...base, locationBoundariesLoading: loading }), { initialProps: { loading: true } });
  expect(setAnimationPhase).not.toHaveBeenCalled();
  rerender({ loading: false }); expect(setAnimationPhase).toHaveBeenCalledWith('intro');
});
