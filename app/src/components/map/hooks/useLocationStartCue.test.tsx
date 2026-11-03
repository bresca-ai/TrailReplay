import { act, renderHook } from '@testing-library/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { expect, it, vi } from 'vitest';
import { locationChapterIntroProgressRef } from '@/utils/locationChapterCamera';
import { useLocationStartCue } from './useLocationStartCue';

it('animates a beacon at the route start only during a location intro', () => {
  const layers = new Map<string, unknown>(), sources = new Map<string, unknown>(), listeners = new Map<string, () => void>();
  const map = {
    getSource: (id: string) => sources.get(id), addSource: (id: string, source: unknown) => sources.set(id, source), removeSource: (id: string) => sources.delete(id),
    getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), removeLayer: (id: string) => layers.delete(id),
    on: (event: string, listener: () => void) => listeners.set(event, listener), off: (event: string) => listeners.delete(event), setPaintProperty: vi.fn(),
  } as unknown as MapLibreMap;
  const ref = { current: map };
  const { rerender, unmount } = renderHook(({ phase, enabled }) => useLocationStartCue(ref, true, phase, [2.1, 41.5], '#ff0000', enabled),
    { initialProps: { phase: 'preloading', enabled: true } });
  expect(sources.size).toBe(0);
  locationChapterIntroProgressRef.current = 0;
  rerender({ phase: 'intro', enabled: true });
  expect(sources.get('location-start-cue')).toMatchObject({ data: { geometry: { type: 'Point', coordinates: [2.1, 41.5] } } });
  act(() => { locationChapterIntroProgressRef.current = .125; listeners.get('move')?.(); });
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-start-cue-ring', 'circle-radius', 25.5);
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-start-cue-dot', 'circle-opacity', 1);
  rerender({ phase: 'playing', enabled: true });
  expect(sources.size).toBe(0);
  expect(layers.size).toBe(0);
  rerender({ phase: 'intro', enabled: false });
  expect(sources.size).toBe(0);
  unmount();
  locationChapterIntroProgressRef.current = 0;
});
