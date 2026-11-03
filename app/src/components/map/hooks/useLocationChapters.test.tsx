import { act, renderHook, waitFor } from '@testing-library/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { expect, it, vi } from 'vitest';
import { useLocationChapters } from './useLocationChapters';
import { loadRouteBoundaries } from '@/utils/locationBoundaries';
import { locationChapterIntroCameraRef, locationChapterIntroProgressRef } from '@/utils/locationChapterCamera';
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
it('makes the opening overview and playback zoom optional', async () => {
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
  const { result, rerender, unmount } = renderHook(({ time, zoom, introZoom }: { time: number; zoom: boolean; introZoom?: boolean }) => useLocationChapters(ref, true, { ...settings, zoomToPlace: zoom, introZoomToPlace: introZoom }, coords, point, time, 'playing'), { initialProps: { time: 0, zoom: true, introZoom: undefined as boolean | undefined } });
  await waitFor(() => expect(source.setData).toHaveBeenCalledWith(feature));
  expect(locationChapterIntroCameraRef.current).toEqual({ center: [1, 1], zoom: 4.5, pitch: 0, bearing: 0 });
  expect(result.current.introCamera).toEqual({ center: [1, 1], zoom: 4.5, pitch: 0, bearing: 0 });
  rerender({ time: 1200, zoom: true, introZoom: undefined });
  expect(result.current.cameraCueRef.current).toMatchObject({ startTime: 0, duration: 10000, target: { zoom: 4.5 } });
  expect(map.setPaintProperty).toHaveBeenLastCalledWith('location-chapter-trace-line', 'line-opacity', 1);
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-chapter-trace-line', 'line-gradient', ['step', ['line-progress'], '#ff0000', .0001, 'rgba(0,0,0,0)']);
  expect(jumpTo).not.toHaveBeenCalled();
  rerender({ time: 5000, zoom: true, introZoom: undefined });
  expect(result.current.label).toBe('🇪🇸 Spain');
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-chapter-trace-line', 'line-gradient', ['step', ['line-progress'], '#ff0000', .5, 'rgba(0,0,0,0)']);
  rerender({ time: 10000, zoom: true, introZoom: undefined });
  expect(result.current.label).toBe('');
  expect(result.current.cameraCueRef.current).toBeNull();
  rerender({ time: 1200, zoom: false, introZoom: undefined });
  expect(result.current.introCamera).toBeUndefined();
  expect(locationChapterIntroCameraRef.current).toBeUndefined();
  expect(result.current.cameraCueRef.current).toBeNull();
  expect(jumpTo).not.toHaveBeenCalled();
  rerender({ time: 1200, zoom: false, introZoom: true });
  expect(result.current.introCamera?.zoom).toBe(4.5);
  expect(result.current.cameraCueRef.current).toBeNull();
  unmount(); expect(locationChapterIntroCameraRef.current).toBeUndefined();
});
it('waits briefly before switching chapters at a border', async () => {
  const make = (id: string, x: number) => ({ type: 'Feature' as const, properties: { id, name: id, iso2: 'ES', iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
  const first = make('one', 0), second = make('two', 1); vi.mocked(loadRouteBoundaries).mockResolvedValue([first, second]);
  const layers = new Map<string, unknown>(); let sourceExists = false; const source = { setData: vi.fn() }, jumpTo = vi.fn();
  const map = { isStyleLoaded: () => true, getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: {id:string}) => layers.set(layer.id, layer), removeLayer: (id:string) => layers.delete(id),
    on: vi.fn(), off: vi.fn(), setPaintProperty: vi.fn(), cameraForBounds: () => ({ center: [1, 1], zoom: 5 }), getCenter: () => ({ lng: .5, lat: .5 }), getZoom: () => 12, getPitch: () => 40, jumpTo } as unknown as MapLibreMap;
  const settings = { level: 'region' as const, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: false, zoomToPlace: true, durationSeconds: 4 };
  const ref = { current: map }, coords = [[.5, .5], [1.5, .5]];
  const { result, rerender } = renderHook(({ time, lon }) => useLocationChapters(ref, true, settings, coords, { lon, lat: .5 }, time, 'playing'), { initialProps: { time: 0, lon: .5 } });
  await waitFor(() => expect(source.setData).toHaveBeenCalledWith(first));
  rerender({ time: 1000, lon: 1.5 }); expect(result.current.label).toBe('one');
  rerender({ time: 1600, lon: 1.5 }); expect(source.setData).toHaveBeenCalledWith(second);
  rerender({ time: 2200, lon: 1.5 }); expect(result.current.label).toBe('two');
  expect(result.current.cameraCueRef.current).toMatchObject({ startTime: 1600, target: { zoom: 4.5 } });
  expect(jumpTo).not.toHaveBeenCalled();
});
it('reveals brief municipality crossings immediately and allows the filter to be increased', async () => {
  const make = (id: string, x: number) => ({ type: 'Feature' as const, properties: { id, name: id, iso2: 'ES', iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
  const first = make('Figueres', 0), second = make('Vilabertran', 1), third = make('Peralada', 2);
  vi.mocked(loadRouteBoundaries).mockResolvedValue([first, second, third]);
  const layers = new Map<string, unknown>(); let sourceExists = false; const source = { setData: vi.fn() };
  const map = { getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), removeLayer: (id: string) => layers.delete(id),
    on: vi.fn(), off: vi.fn(), setPaintProperty: vi.fn(), cameraForBounds: () => undefined } as unknown as MapLibreMap;
  const settings = { level: 'adm3' as const, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: false, zoomToPlace: false, durationSeconds: 4 };
  const ref = { current: map }, coords = [[.5, .5], [1.5, .5], [2.5, .5]];
  const { result, rerender } = renderHook(({ time, lon, minimumStaySeconds }: { time: number; lon: number; minimumStaySeconds?: number }) => useLocationChapters(ref, true, { ...settings, minimumStaySeconds }, coords, { lon, lat: .5 }, time, 'playing'), { initialProps: { time: 0, lon: .5, minimumStaySeconds: undefined as number | undefined } });
  await waitFor(() => expect(source.setData).toHaveBeenCalledWith(first));
  rerender({ time: 1000, lon: 1.5, minimumStaySeconds: undefined });
  expect(source.setData).toHaveBeenCalledWith(second);
  rerender({ time: 1100, lon: 1.5, minimumStaySeconds: undefined });
  expect(result.current.label).toBe('Vilabertran');
  rerender({ time: 1200, lon: 2.5, minimumStaySeconds: .5 });
  expect(source.setData).not.toHaveBeenCalledWith(third);
  rerender({ time: 1750, lon: 2.5, minimumStaySeconds: .5 });
  expect(source.setData).toHaveBeenCalledWith(third);
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
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-chapter-line', 'line-opacity', .3);
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
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-chapter-line', 'line-opacity', .3);
  expect(map.setPaintProperty).toHaveBeenCalledWith('location-chapter-trace-line', 'line-opacity', 1);
  rerender({ time: 500, phase: 'playing' }); expect(result.current.label).toBe('🇪🇸 Catalonia');
  expect(jumpTo).not.toHaveBeenCalled();
  rerender({ time: 2000, phase: 'playing' }); expect(result.current.label).toBe('');
});
it('reveals each selected level in order as the intro camera zooms in', async () => {
  const make = (id: string, extent: number) => ({ type: 'Feature' as const, properties: { id, name: id, iso2: 'ES', iso3: 'ESP', credit: id }, geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [extent, 0], [extent, extent], [0, extent], [0, 0]]] } });
  const country = make('Spain', 3), region = make('Catalonia', 2), town = make('Figueres', 1);
  vi.mocked(loadRouteBoundaries).mockImplementation(async (_points, level) => level === 'country' ? [country] : level === 'region' ? [region] : [town]);
  const layers = new Map<string, unknown>(), listeners = new Map<string, () => void>();
  const source = { setData: vi.fn() }; let sourceExists = false, zoom = 4;
  const map = { getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), removeLayer: (id: string) => layers.delete(id),
    on: (event: string, handler: () => void) => listeners.set(event, handler), off: (event: string) => listeners.delete(event), setPaintProperty: vi.fn(),
    cameraForBounds: (bounds: { getEast: () => number }) => ({ center: [.5, .5], zoom: bounds.getEast() > 2 ? 4 : 7 }), getZoom: () => zoom } as unknown as MapLibreMap;
  const settings = { level: 'adm3' as const, introLevels: ['country', 'region', 'adm3'] as Array<'country' | 'region' | 'adm3'>, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: false, zoomToPlace: true, durationSeconds: 4.5 };
  const coords = [[.5, .5]], ref = { current: map };
  const { result } = renderHook(() => useLocationChapters(ref, true, settings, coords, { lon: .5, lat: .5 }, 0, 'intro'));
  await waitFor(() => expect(result.current.introCamera).toBeDefined());
  act(() => { locationChapterIntroProgressRef.current = .1; listeners.get('move')?.(); });
  expect(result.current.label).toBe('Spain');
  expect(result.current.introCamera?.zoom).toBe(3.5);
  expect(result.current.introRegionCamera?.zoom).toBe(6.5);
  act(() => { zoom = 6; locationChapterIntroProgressRef.current = .4; listeners.get('move')?.(); });
  expect(result.current.label).toBe('Catalonia');
  expect(source.setData).toHaveBeenCalledWith(region);
  act(() => { locationChapterIntroProgressRef.current = .7; listeners.get('move')?.(); });
  expect(result.current.label).toBe('Figueres');
  expect(source.setData).toHaveBeenCalledWith(town);
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
it('skips an unavailable opening level and reports it while retaining the others', async () => {
  const make = (id: string) => ({ type: 'Feature' as const, properties: { id, name: id, iso3: 'ESP', credit: 'source' }, geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } });
  const country = make('Spain'), town = make('Figueres');
  vi.mocked(loadRouteBoundaries).mockImplementation(async (_points, level) => level === 'country' ? [country] : level === 'region' ? [] : [town]);
  const layers = new Map<string, unknown>(); let sourceExists = false;
  const source = { setData: vi.fn() };
  const map = { getSource: () => sourceExists ? source : undefined, addSource: () => { sourceExists = true; }, removeSource: () => { sourceExists = false; },
    getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), removeLayer: (id: string) => layers.delete(id),
    on: vi.fn(), off: vi.fn(), setPaintProperty: vi.fn(), cameraForBounds: () => ({ center: [.5, .5], zoom: 5 }) } as unknown as MapLibreMap;
  const settings = { level: 'adm3' as const, introLevels: ['country', 'region', 'adm3'] as Array<'country' | 'region' | 'adm3'>, color: '#ff0000', width: 4, fill: true, showName: true, showFlag: false, zoomToPlace: true, durationSeconds: 4.5 };
  const coords = [[.5, .5]], ref = { current: map };
  const { result } = renderHook(() => useLocationChapters(ref, true, settings, coords, { lon: .5, lat: .5 }, 0, 'preloading'));
  await waitFor(() => expect(result.current.missing).toContain('ADM1'));
  expect(result.current.error).toBe(false);
  expect(result.current.introStages.map(stage => stage.feature.properties.name)).toEqual(['Spain', 'Figueres']);
});
