import { renderHook, waitFor } from '@testing-library/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { expect, it, vi } from 'vitest';
import { useLocationChapters } from './useLocationChapters';
import { loadRouteBoundaries } from '@/utils/locationBoundaries';
vi.mock('@/utils/locationBoundaries', async importOriginal => ({ ...(await importOriginal<typeof import('@/utils/locationBoundaries')>()), loadRouteBoundaries: vi.fn() }));
it('shows the current country and styles its outline during playback', async () => {
  const feature = { type: 'Feature' as const, properties: { id: 'test', name: 'Spain', iso2: 'ES', iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } };
  vi.mocked(loadRouteBoundaries).mockResolvedValue([feature]);
  const layers = new Map<string, unknown>(); let sourceExists = false;
  const source = { setData: vi.fn() };
  const map = { isStyleLoaded: () => true, getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: {id:string}) => layers.set(layer.id, layer), removeLayer: (id:string) => layers.delete(id),
    on: vi.fn(), off: vi.fn(), setPaintProperty: vi.fn(), cameraForBounds: () => undefined } as unknown as MapLibreMap;
  const ref = { current: map }, coords = [[.5, .5], [1, 1]], point = { lon: .5, lat: .5 };
  const settings = { level: 'country' as const, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: true, zoomToPlace: false, durationSeconds: 4 };
  const { result, rerender } = renderHook(({ time }) => useLocationChapters(ref, true, settings, coords, point, time, 'playing'), { initialProps: { time: 0 } });
  await waitFor(() => expect(source.setData).toHaveBeenCalledWith(feature));
  rerender({ time: 1000 });
  await waitFor(() => expect(result.current.label).toBe('🇪🇸 Spain'));
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-chapter-line', 'line-color', '#ff0000');
  rerender({ time: 5000 });
  expect(result.current.label).toBe('');
});
it('zooms towards the current location while its chapter is active', async () => {
  const feature = { type: 'Feature' as const, properties: { id: 'test', name: 'Spain', iso2: 'ES', iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } };
  vi.mocked(loadRouteBoundaries).mockResolvedValue([feature]);
  const layers = new Map<string, unknown>(); let sourceExists = false;
  const source = { setData: vi.fn() }, jumpTo = vi.fn();
  const map = { isStyleLoaded: () => true, getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: {id:string}) => layers.set(layer.id, layer), removeLayer: (id:string) => layers.delete(id),
    on: vi.fn(), off: vi.fn(), setPaintProperty: vi.fn(), cameraForBounds: () => ({ center: [1, 1], zoom: 5 }),
    getCenter: () => ({ lng: .5, lat: .5 }), getZoom: () => 12, getPitch: () => 40, jumpTo } as unknown as MapLibreMap;
  const settings = { level: 'country' as const, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: true, zoomToPlace: true, durationSeconds: 4 };
  const ref = { current: map }, coords = [[.5, .5]], point = { lon: .5, lat: .5 };
  const { rerender } = renderHook(({ time }) => useLocationChapters(ref, true, settings, coords, point, time, 'playing'), { initialProps: { time: 0 } });
  await waitFor(() => expect(source.setData).toHaveBeenCalledWith(feature));
  rerender({ time: 1200 });
  expect(jumpTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 5, pitch: 0 }));
});
it('waits briefly before switching chapters at a border', async () => {
  const make = (id: string, x: number) => ({ type: 'Feature' as const, properties: { id, name: id, iso2: 'ES', iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
  const first = make('one', 0), second = make('two', 1); vi.mocked(loadRouteBoundaries).mockResolvedValue([first, second]);
  const layers = new Map<string, unknown>(); let sourceExists = false; const source = { setData: vi.fn() };
  const map = { isStyleLoaded: () => true, getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: {id:string}) => layers.set(layer.id, layer), removeLayer: (id:string) => layers.delete(id),
    on: vi.fn(), off: vi.fn(), setPaintProperty: vi.fn(), cameraForBounds: () => undefined } as unknown as MapLibreMap;
  const settings = { level: 'region' as const, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: false, zoomToPlace: false, durationSeconds: 4 };
  const ref = { current: map }, coords = [[.5, .5], [1.5, .5]];
  const { result, rerender } = renderHook(({ time, lon }) => useLocationChapters(ref, true, settings, coords, { lon, lat: .5 }, time, 'playing'), { initialProps: { time: 0, lon: .5 } });
  await waitFor(() => expect(source.setData).toHaveBeenCalledWith(first));
  rerender({ time: 1000, lon: 1.5 }); expect(result.current.label).toBe('one');
  rerender({ time: 1600, lon: 1.5 }); expect(source.setData).toHaveBeenCalledWith(second);
  rerender({ time: 2200, lon: 1.5 }); expect(result.current.label).toBe('two');
});
it('installs and displays the chapter when tiles keep the style loading', async () => {
  const feature = { type: 'Feature' as const, properties: { id: 'es', name: 'Spain', iso2: 'ES', iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } };
  vi.mocked(loadRouteBoundaries).mockResolvedValue([feature]);
  const listeners = new Map<string, () => void>(), layers = new Map<string, unknown>();
  const source = { setData: vi.fn() }; let sourceExists = false, styleReady = false;
  const map = { isStyleLoaded: () => false, getSource: () => sourceExists ? source : undefined,
    addSource: () => { if (!styleReady) throw new Error('Style not ready'); sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), removeLayer: (id: string) => layers.delete(id),
    on: (event: string, handler: () => void) => listeners.set(event, handler), off: (event: string) => listeners.delete(event),
    setPaintProperty: vi.fn(), cameraForBounds: () => undefined } as unknown as MapLibreMap;
  const settings = { level: 'country' as const, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: true, zoomToPlace: false, durationSeconds: 4 };
  const coords = [[.5, .5]], point = { lon: .5, lat: .5 }, ref = { current: map };
  const { rerender } = renderHook(({ time }) => useLocationChapters(ref, true, settings, coords, point, time, 'playing'), { initialProps: { time: 0 } });
  await waitFor(() => expect(loadRouteBoundaries).toHaveBeenCalled());
  styleReady = true;
  const { act } = await import('@testing-library/react');
  act(() => listeners.get('sourcedata')?.());
  await waitFor(() => expect(source.setData).toHaveBeenCalledWith(feature));
  rerender({ time: 1000 });
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-chapter-line', 'line-opacity', 1);
});
it('shows the first boundary during the opening fly-in without a second zoom after it', async () => {
  const feature = { type: 'Feature' as const, properties: { id: 'es', name: 'Catalonia', iso2: 'ES', iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } };
  vi.mocked(loadRouteBoundaries).mockResolvedValue([feature]);
  const layers = new Map<string, unknown>(); let sourceExists = false;
  const source = { setData: vi.fn() }, jumpTo = vi.fn();
  const map = { getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), removeLayer: (id: string) => layers.delete(id),
    on: vi.fn(), off: vi.fn(), setPaintProperty: vi.fn(), cameraForBounds: () => ({ center: [1, 1], zoom: 5 }), jumpTo } as unknown as MapLibreMap;
  const settings = { level: 'region' as const, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: true, zoomToPlace: true, durationSeconds: 4.5 };
  const ref = { current: map }, coords = [[.5, .5]], point = { lon: .5, lat: .5 };
  const { result, rerender } = renderHook(({ time, phase }: {time: number; phase: string}) => useLocationChapters(ref, true, settings, coords, point, time, phase), { initialProps: { time: 0, phase: 'intro' } });
  await waitFor(() => expect(result.current.label).toBe('🇪🇸 Catalonia'));
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-chapter-line', 'line-opacity', 1);
  rerender({ time: 500, phase: 'playing' }); expect(result.current.label).toBe('🇪🇸 Catalonia');
  expect(jumpTo).not.toHaveBeenCalled();
  rerender({ time: 2000, phase: 'playing' }); expect(result.current.label).toBe('');
});
it('prepares the first region during preloading and reveals the next one during playback', async () => {
  const make = (id: string, x: number) => ({ type: 'Feature' as const, properties: { id, name: id, iso2: 'ES', iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
  const first = make('Catalonia', 0), second = make('Occitanie', 1); vi.mocked(loadRouteBoundaries).mockResolvedValue([first, second]);
  const layers = new Map<string, unknown>(); let sourceExists = false; const source = { setData: vi.fn() };
  const map = { getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: {id:string}) => layers.set(layer.id, layer), removeLayer: (id:string) => layers.delete(id),
    on: vi.fn(), off: vi.fn(), setPaintProperty: vi.fn(), cameraForBounds: () => undefined } as unknown as MapLibreMap;
  const settings = { level: 'region' as const, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: false, zoomToPlace: false, durationSeconds: 4.5 };
  const ref = { current: map }, coords = [[.5, .5], [1.5, .5]];
  const { result, rerender } = renderHook(({ time, lon, phase }: {time: number; lon: number; phase: string}) => useLocationChapters(ref, true, settings, coords, { lon, lat: .5 }, time, phase), { initialProps: { time: 0, lon: .5, phase: 'preloading' } });
  await waitFor(() => expect(source.setData).toHaveBeenCalledWith(first)); expect(result.current.label).toBe('');
  rerender({ time: 0, lon: .5, phase: 'intro' }); expect(result.current.label).toBe('Catalonia');
  rerender({ time: 1000, lon: .5, phase: 'playing' }); expect(result.current.label).toBe('Catalonia');
  rerender({ time: 2000, lon: 1.5, phase: 'playing' });
  rerender({ time: 2600, lon: 1.5, phase: 'playing' }); expect(source.setData).toHaveBeenCalledWith(second);
  rerender({ time: 3200, lon: 1.5, phase: 'playing' }); expect(result.current.label).toBe('Occitanie');
});
