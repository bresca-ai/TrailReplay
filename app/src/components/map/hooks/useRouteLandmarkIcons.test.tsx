import { renderHook, waitFor } from '@testing-library/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { afterEach, expect, it, vi } from 'vitest';
import type { RouteLandmark } from '@/types/landmarks';
import { useRouteLandmarksLayer } from './useRouteLandmarksLayer';

it('loads a saved library icon onto the map and keeps emoji in a separate full-colour layer', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ icons: { bicycle: { svg: '<svg><path d="M1 1L14 14Z"/></svg>' } } }) }));
  vi.stubGlobal('Path2D', class {});
  vi.stubGlobal('ImageData', class {});
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn().mockResolvedValue([]) } });
  const context = { clearRect: vi.fn(), scale: vi.fn(), fill: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), measureText: () => ({ width: 20 }), getImageData: () => ({}) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const images = new Set<string>();
  const layers = new Map<string, unknown>();
  const source = { setData: vi.fn() };
  const addImage = vi.fn((id: string) => { images.add(id); });
  const map = { isStyleLoaded: () => true, on: vi.fn(), off: vi.fn(), addImage, updateImage: vi.fn(), hasImage: (id: string) => images.has(id), getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), addSource: vi.fn(), getSource: () => source, setLayoutProperty: vi.fn(), setPaintProperty: vi.fn() };
  const base: RouteLandmark = { id: 'bike', icon: 'pinhead:bicycle', type: 'custom', source: 'user', display: 'subtle', lat: 42, lon: 1, progress: 0.5, title: 'Bike', importance: 3 };
  const landmarks = [base, { ...base, id: 'tent', title: 'Tent', icon: 'emoji:🏕️' }];
  renderHook(() => useRouteLandmarksLayer({ isMapLoaded: true, overlayFont: 'modern', landmarks, mapRef: { current: map as unknown as MapLibreMap } }));
  await waitFor(() => expect(addImage).toHaveBeenCalledWith('route-landmark-glyph-pinhead:bicycle', expect.anything(), { sdf: true }));
  expect(addImage).toHaveBeenCalledWith('route-landmark-glyph-emoji:🏕️', expect.anything());
  await waitFor(() => expect(source.setData).toHaveBeenCalled());
  const data = source.setData.mock.lastCall?.[0];
  expect(data.features.map((feature: GeoJSON.Feature) => feature.properties)).toEqual(expect.arrayContaining([
    expect.objectContaining({ landmarkId: 'bike', icon: 'pinhead:bicycle', emoji: false }),
    expect.objectContaining({ landmarkId: 'tent', icon: 'emoji:🏕️', emoji: true }),
  ]));
  expect(layers.has('route-landmarks-emoji')).toBe(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('waits for a recreated map style before adding landmark sources and layers', async () => {
  vi.stubGlobal('Path2D', class {});
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn().mockResolvedValue([]) } });
  const context = { clearRect: vi.fn(), scale: vi.fn(), fill: vi.fn(), getImageData: () => ({}) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  let ready = false;
  const listeners = new Map<string, () => void>();
  const layers = new Map<string, unknown>();
  const images = new Set<string>();
  const source = { setData: vi.fn() };
  let hasSource = false;
  const map = {
    isStyleLoaded: () => ready,
    on: (event: string, handler: () => void) => listeners.set(event, handler),
    off: (event: string) => listeners.delete(event),
    hasImage: (id: string) => images.has(id), addImage: (id: string) => images.add(id),
    getSource: () => hasSource ? source : undefined,
    addSource: vi.fn(() => { if (!ready) throw new Error('Style is not done loading.'); hasSource = true; }),
    getLayer: (id: string) => layers.get(id),
    addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
    setLayoutProperty: vi.fn(), setPaintProperty: vi.fn(),
  };
  const ref = { current: map as unknown as MapLibreMap };
  const { unmount } = renderHook(() => useRouteLandmarksLayer({ isMapLoaded: true, overlayFont: 'modern', landmarks: [], mapRef: ref }));
  expect(map.addSource).not.toHaveBeenCalled();
  ready = true;
  listeners.get('styledata')?.();
  expect(map.addSource).toHaveBeenCalledOnce();
  await waitFor(() => expect(source.setData).toHaveBeenCalled());
  unmount();
  expect(listeners.size).toBe(0);
});


it('shows places after the intro while map tiles and fonts are still loading', async () => {
  vi.stubGlobal('Path2D', class {});
  let finishFont!: () => void;
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn(() => new Promise<void>((resolve) => { finishFont = resolve; })) } });
  const context = { clearRect: vi.fn(), scale: vi.fn(), fill: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), measureText: () => ({ width: 20 }), getImageData: () => ({}) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const images = new Set<string>();
  const layers = new Map<string, unknown>();
  const source = { setData: vi.fn() };
  let styleLoaded = true;
  const map = {
    isStyleLoaded: () => styleLoaded, on: vi.fn(), off: vi.fn(),
    hasImage: (id: string) => images.has(id), addImage: (id: string) => images.add(id), updateImage: vi.fn(),
    getSource: () => source, addSource: vi.fn(), getLayer: (id: string) => layers.get(id),
    addLayer: (layer: { id: string }) => layers.set(layer.id, layer), setLayoutProperty: vi.fn(), setPaintProperty: vi.fn(),
  };
  const landmark: RouteLandmark = { id: 'place', icon: 'emoji:🏕️', type: 'custom', source: 'user', display: 'subtle', lat: 42, lon: 1, progress: 0.5, title: 'Camp', importance: 3 };
  const ref = { current: map as unknown as MapLibreMap };
  const landmarks = [landmark];
  const { rerender } = renderHook(({ visible, places }) => useRouteLandmarksLayer({ isMapLoaded: true, overlayFont: 'modern', landmarks: places, mapRef: ref, visible }), { initialProps: { visible: false, places: landmarks } });
  expect(source.setData.mock.lastCall?.[0].features).toHaveLength(1);
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-label', 'visibility', 'none');
  styleLoaded = false; // Tiles are still being fetched by the opening camera.
  map.setLayoutProperty.mockClear();
  rerender({ visible: true, places: landmarks });
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-icon', 'visibility', 'visible');
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-label', 'visibility', 'visible');
  const updated = [...landmarks, { ...landmark, id: 'another', title: 'Another camp' }];
  rerender({ visible: true, places: updated });
  expect(source.setData.mock.lastCall?.[0].features).toHaveLength(2);
  finishFont();
  await waitFor(() => expect(source.setData).toHaveBeenCalledTimes(3));
  expect(source.setData.mock.lastCall?.[0].features[0].properties.labelImageId).toMatch(/-ready$/);
});

it('switches between classic layers and a single compact icon-and-label sprite', async () => {
  vi.stubGlobal('Path2D', class {});
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn().mockResolvedValue([]) } });
  const context = { clearRect: vi.fn(), scale: vi.fn(), translate: vi.fn(), save: vi.fn(), restore: vi.fn(), fill: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), measureText: () => ({ width: 40 }), getImageData: () => ({}) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const images = new Set<string>(); const layers = new Map<string, unknown>(); const source = { setData: vi.fn() };
  const map = { isStyleLoaded: () => true, on: vi.fn(), off: vi.fn(), hasImage: (id: string) => images.has(id), addImage: (id: string) => images.add(id), getSource: () => source, addSource: vi.fn(), getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), setLayoutProperty: vi.fn(), setPaintProperty: vi.fn() };
  const landmark: RouteLandmark = { id: 'summit', type: 'summit', source: 'user', display: 'subtle', lat: 42, lon: 1, progress: 0.5, title: 'Puig Alt', elevation: 2431, importance: 3 };
  const ref = { current: map as unknown as MapLibreMap }; const landmarks = [landmark];
  const { rerender } = renderHook(({ style }) => useRouteLandmarksLayer({ isMapLoaded: true, overlayFont: 'modern', landmarks, mapRef: ref, landmarkStyle: style }), { initialProps: { style: 'classic' as 'classic' | 'minimal' } });
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-icon', 'visibility', 'visible');
  map.setLayoutProperty.mockClear();
  rerender({ style: 'minimal' });
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-icon', 'visibility', 'none');
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-emoji', 'visibility', 'none');
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-label', 'visibility', 'visible');
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-label', 'icon-offset', [11.5, 0]);
  expect(context.fillText).toHaveBeenCalledWith('Puig Alt | 2,431 m', expect.any(Number), expect.any(Number), expect.any(Number));
  await waitFor(() => expect(source.setData.mock.lastCall?.[0].features[0].properties.labelImageId).toContain('minimal-'));
  rerender({ style: 'classic' });
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-icon', 'visibility', 'visible');
  expect(map.setLayoutProperty).toHaveBeenCalledWith('route-landmarks-label', 'icon-offset', [0, 18]);
});
