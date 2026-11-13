import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { createDefaultSettings } from '@/store/defaults';
import { useBaseMapPresentation } from './useBaseMapPresentation';

describe('terrain presentation', () => {
  it('updates exaggeration and restores it after recorded elevation or terrain is disabled', () => {
    const setTerrain = vi.fn();
    const map = { getLayer: () => null, getSource: () => ({}), setTerrain } as unknown as Map;
    const settings = createDefaultSettings();
    const { rerender } = renderHook(({ value }) => useBaseMapPresentation({
      currentTrackColor: null, isMapLoaded: true, mapRef: { current: map }, settings: value, trailStyle: value.trailStyle,
    }), { initialProps: { value: settings } });
    expect(setTerrain).toHaveBeenLastCalledWith({ source: 'terrain-dem', exaggeration: 1 });
    rerender({ value: { ...settings, terrainExaggeration: 2.4 } });
    expect(setTerrain).toHaveBeenLastCalledWith({ source: 'terrain-dem', exaggeration: 2.4 });
    rerender({ value: { ...settings, terrainExaggeration: 2.4, recordedElevationPrototype: true } });
    expect(setTerrain).toHaveBeenLastCalledWith({ source: 'terrain-dem', exaggeration: 1 });
    rerender({ value: { ...settings, terrainExaggeration: 2.4, show3DTerrain: false } });
    expect(setTerrain).toHaveBeenLastCalledWith(null);
    rerender({ value: { ...settings, terrainExaggeration: 2.4 } });
    expect(setTerrain).toHaveBeenLastCalledWith({ source: 'terrain-dem', exaggeration: 2.4 });
  });
});
