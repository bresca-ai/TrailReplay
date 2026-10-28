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
  const map = { isStyleLoaded: () => true, on: vi.fn(), off: vi.fn(), addImage, hasImage: (id: string) => images.has(id), getLayer: (id: string) => layers.get(id), addLayer: (layer: { id: string }) => layers.set(layer.id, layer), addSource: vi.fn(), getSource: () => source, setLayoutProperty: vi.fn(), setPaintProperty: vi.fn() };
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
