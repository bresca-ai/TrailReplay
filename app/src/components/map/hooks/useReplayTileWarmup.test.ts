import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { NOOP_TILE_PRELOAD_OBSERVER } from '@/utils/tilePreloadObserver';
import { canReuseStartupWarmup, discoveryTileRequest, replayViewOffsetSeconds, replayWarmupHorizonMs, useReplayTileWarmup, viewportTilePriority } from './useReplayTileWarmup';

const { MapConstructor, map } = vi.hoisted(() => {
  const map = {
    on: vi.fn(), off: vi.fn(), once: vi.fn(), remove: vi.fn(),
    isStyleLoaded: () => false, loaded: vi.fn(() => false), jumpTo: vi.fn(),
    getLayer: vi.fn(() => undefined), getSource: vi.fn(() => undefined),
    cameraForBounds: vi.fn(() => undefined),
    getCanvas: () => ({ clientWidth: 1000, clientHeight: 600 }),
    project: () => ({ x: 500, y: 348 }),
  };
  return { map, MapConstructor: vi.fn(function (options?: Record<string, unknown>) { return { ...map, options }; }) };
});
vi.mock('maplibre-gl', () => ({ Map: MapConstructor, LngLatBounds: class { extend() { return this; } } }));
vi.mock('./useLocationChapters', () => ({ cameraForPlace: () => ({ center: [1.84, 41.59], zoom: 5, pitch: 0, bearing: 0 }) }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', vi.fn(function () {
    return { observe: vi.fn(), disconnect: vi.fn() };
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  map.loaded.mockReturnValue(false);
});

describe('replay tile warmup camera', () => {
  it('prepares a loaded route while idle and reuses that scan when play starts', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => new Blob(['tile']) }));
    const coordinates = [[30, 30], [30.0001, 30.0001]];
    const elevations: Array<{ elevation: number }> = [];
    const ready = vi.fn();
    const visibleMapRef = { current: null };
    const { rerender, unmount } = renderHook(({ phase, playing }) => useReplayTileWarmup({
      allCoordinates: coordinates, routeCoordinates: coordinates, animationPhase: phase,
      cameraMode: 'aerial-follow', diagnostics: NOOP_TILE_PRELOAD_OBSERVER,
      elevationData: elevations, enabled: true, followBehindZoomLevel: 33, isMapLoaded: true,
      isPlaying: playing, mapStyle: 'satellite', visibleMapRef, playbackProgress: 0,
      playbackSpeed: 1, totalDurationMs: 1000, onStartupReadyChange: ready,
    }), { initialProps: { phase: 'idle' as 'idle' | 'preloading' | 'outro', playing: false } });
    const listeners = map.once.mock.calls.filter(([event]) => event === 'style.load');
    await act(async () => { listeners.forEach(([, listener]) => listener()); await vi.advanceTimersByTimeAsync(20000); });
    expect(map.jumpTo).toHaveBeenCalled();
    const visits = map.jumpTo.mock.calls.length;
    rerender({ phase: 'preloading', playing: true });
    expect(ready).toHaveBeenCalledWith(true, true);
    expect(map.jumpTo.mock.calls.length).toBe(visits);
    rerender({ phase: 'outro', playing: false });
    ready.mockClear();
    rerender({ phase: 'preloading', playing: true });
    expect(ready).toHaveBeenCalledWith(true, true);
    unmount();
  });
  it('abandons an idle scan when the route changes and prepares the new route', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => new Blob(['tile']) }));
    const first = [[32, 30], [32.0001, 30.0001]];
    const second = [[33, 30], [33.0001, 30.0001]];
    const elevations: Array<{ elevation: number }> = [];
    const ready = vi.fn();
    const visibleMapRef = { current: null };
    const { rerender, unmount } = renderHook(({ route, phase, playing }) => useReplayTileWarmup({
      allCoordinates: route, routeCoordinates: route, animationPhase: phase, cameraMode: 'follow',
      diagnostics: NOOP_TILE_PRELOAD_OBSERVER, elevationData: elevations, enabled: true,
      followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: playing, mapStyle: 'satellite',
      visibleMapRef, playbackProgress: 0, playbackSpeed: 1, totalDurationMs: 1000, onStartupReadyChange: ready,
    }), { initialProps: { route: first, phase: 'idle' as 'idle' | 'preloading', playing: false } });
    const listeners = map.once.mock.calls.filter(([event]) => event === 'style.load');
    await act(async () => { listeners.forEach(([, listener]) => listener()); await vi.advanceTimersByTimeAsync(2000); });
    rerender({ route: second, phase: 'idle', playing: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(map.jumpTo.mock.calls.some(([pose]) => pose.center[0] > 32.9)).toBe(true);
    rerender({ route: second, phase: 'preloading', playing: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(ready).toHaveBeenCalledWith(true, true);
    unmount();
  });
  it('reuses only a recent successful warmup with unchanged route and camera settings', () => {
    const route = [[1, 2], [3, 4]];
    const previous = { values: [route, 'satellite', 60], at: 1000 };
    expect(canReuseStartupWarmup([route, 'satellite', 60], previous, 2000, false)).toBe(true);
    expect(canReuseStartupWarmup([route, 'topo', 60], previous, 2000, false)).toBe(false);
    expect(canReuseStartupWarmup([route, 'satellite', 60], previous, 2000, true)).toBe(false);
    expect(canReuseStartupWarmup([route, 'satellite', 60], previous, 301001, false)).toBe(false);
  });
  it('estimates when a future route view will be needed at each playback speed', () => {
    expect(replayViewOffsetSeconds(0.5, 0.25, 60000, 1)).toBe(15);
    expect(replayViewOffsetSeconds(0.5, 0.25, 60000, 2)).toBe(7.5);
    expect(replayViewOffsetSeconds(0.1, 0.25, 60000, 1)).toBe(0);
  });
  it('keeps future samples distributed across the remaining route', () => {
    expect(replayWarmupHorizonMs(45000, 0, 60000)).toBe(45000);
    expect(replayWarmupHorizonMs(360000, 0.5, 60000)).toBe(30000);
    expect(replayWarmupHorizonMs(45000, 0.9, 60000)).toBeCloseTo(6000);
    expect(replayWarmupHorizonMs(45000, 1, 60000)).toBe(0);
  });
  it('prioritizes the middle of the view without excluding its edges', () => {
    const center = viewportTilePriority('12/10/20', () => ({ x: 500, y: 348 }), 1000, 600);
    const edge = viewportTilePriority('12/10/20', () => ({ x: 1000, y: 348 }), 1000, 600);
    expect(center).toBe(0);
    expect(edge).toBeGreaterThan(center);
    expect(Number.isFinite(edge)).toBe(true);
    expect(viewportTilePriority('invalid', () => ({ x: 0, y: 0 }), 1000, 600)).toBe(0);
  });
  it('uses placeholders only for imagery the scheduler can fetch', () => {
    const imagery = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/10/20';
    const dem = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/20/10.png';
    expect(discoveryTileRequest(imagery, 'Tile').url).toMatch(/^data:image\/png/);
    expect(discoveryTileRequest('https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/12/20/10@2x?access_token=test', 'Tile').url).toMatch(/^data:image\/png/);
    expect(discoveryTileRequest(dem, 'Tile').url).toBe(dem);
    expect(discoveryTileRequest(imagery, 'Source').url).toBe(imagery);
    expect(discoveryTileRequest('https://example.com/custom/12/20/10.png', 'Tile').url).toContain('example.com');
  });
  it('predicts the full cinematic pitch without rendering an invisible Retina canvas', () => {
    const visible = document.createElement('div');
    Object.defineProperties(visible, { clientWidth: { value: 1118 }, clientHeight: { value: 575 } });
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
      visibleMapRef: { current: { getContainer: () => visible } as unknown as MapLibreMap },
      playbackProgress: 0,
      playbackSpeed: 1,
      totalDurationMs: 95000,
    }));

    expect(MapConstructor).toHaveBeenCalledWith(expect.objectContaining({ maxPitch: 85, pixelRatio: 1 }));
    const options = MapConstructor.mock.calls[0][0];
    expect(options?.style).not.toHaveProperty('terrain');
    expect(options?.container).toHaveStyle({ width: '1118px', height: '575px' });
    expect(options?.maxTileCacheSize).toBe(128);
    unmount();
    expect(map.remove).toHaveBeenCalledOnce();
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('uses the playback terrain scale for aerial tile discovery', () => {
    const { unmount } = renderHook(() => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58], [1.85, 41.60]], animationPhase: 'playing', cameraMode: 'aerial-follow',
      diagnostics: NOOP_TILE_PRELOAD_OBSERVER, elevationData: [], enabled: true, followBehindZoomLevel: 33,
      isMapLoaded: true, isPlaying: true, mapStyle: 'satellite', visibleMapRef: { current: null },
      playbackProgress: 0, playbackSpeed: 1, totalDurationMs: 60000, terrainExaggeration: 1,
    }));
    expect(MapConstructor.mock.calls[0][0]?.style).toHaveProperty('terrain', { source: 'terrain-dem', exaggeration: 1 });
    unmount();
  });

  it('continues predicting the fallback aerial camera after terrain planning fails', async () => {
    vi.useFakeTimers();
    const visibleMapRef = { current: null };
    const { rerender, unmount } = renderHook(({ loading }) => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58], [1.85, 41.60]], animationPhase: 'playing', cameraMode: 'aerial-follow',
      aerialTerrainLoading: loading, aerialTerrainPlan: null, terrainExaggeration: 1,
      diagnostics: NOOP_TILE_PRELOAD_OBSERVER, elevationData: [], enabled: true, followBehindZoomLevel: 33,
      isMapLoaded: true, isPlaying: true, mapStyle: 'satellite', visibleMapRef,
      playbackProgress: 0, playbackSpeed: 1, totalDurationMs: 300000,
    }), { initialProps: { loading: true } });
    const loadListener = map.once.mock.calls.find(([event]) => event === 'style.load')?.[1];
    act(() => { loadListener(); vi.advanceTimersByTime(1600); });
    expect(map.jumpTo).not.toHaveBeenCalled();
    rerender({ loading: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(map.jumpTo).toHaveBeenCalled();
    unmount();
  });

  it('keeps observing a view briefly after the first render, then advances', async () => {
    vi.useFakeTimers();
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
      visibleMapRef: { current: null },
      playbackProgress: 0,
      playbackSpeed: 1,
      totalDurationMs: 95000,
    }));
    const loadListener = map.once.mock.calls.find(([event]) => event === 'style.load')?.[1];
    act(() => { loadListener(); vi.advanceTimersByTime(1500); });
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(map.jumpTo).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('records imagery discovered after a terrain view has started rendering', () => {
    vi.useFakeTimers();
    const predictTile = vi.fn();
    const { unmount } = renderHook(() => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58], [1.85, 41.60]], animationPhase: 'playing', cameraMode: 'follow',
      diagnostics: { ...NOOP_TILE_PRELOAD_OBSERVER, predictTile }, elevationData: [], enabled: true,
      followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapStyle: 'satellite',
      visibleMapRef: { current: null }, playbackProgress: 0, playbackSpeed: 1, totalDurationMs: 60000,
    }));
    const loadListener = map.once.mock.calls.find(([event]) => event === 'style.load')?.[1];
    act(() => { loadListener(); vi.advanceTimersByTime(1600); });
    const onLoading = map.on.mock.calls.find(([event]) => event === 'sourcedataloading')?.[1];
    act(() => onLoading({ sourceId: 'satellite', coord: { canonical: { z: 12, x: 1, y: 2 } } }));
    expect(predictTile).toHaveBeenCalledWith('satellite', '12/1/2');
    unmount();
  });

  it('reports completed predictions to a diagnostics observer installed after mount', async () => {
    vi.useFakeTimers();
    class LoadedImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', LoadedImage);
    const visibleMapRef = { current: null };
    const ready = vi.fn();
    const updatedObserver = { ...NOOP_TILE_PRELOAD_OBSERVER, markTileReady: ready };
    const { rerender, unmount } = renderHook(({ diagnostics }) => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58], [1.85, 41.60]], animationPhase: 'playing', cameraMode: 'follow',
      diagnostics, elevationData: [], enabled: true, followBehindZoomLevel: 33, isMapLoaded: true,
      isPlaying: true, mapStyle: 'satellite', visibleMapRef, playbackProgress: 0, playbackSpeed: 1, totalDurationMs: 60000,
    }), { initialProps: { diagnostics: NOOP_TILE_PRELOAD_OBSERVER } });
    rerender({ diagnostics: updatedObserver });
    const loadListeners = map.once.mock.calls.filter(([event]) => event === 'style.load').slice(-2);
    act(() => { loadListeners.forEach(([, listener]) => listener()); vi.advanceTimersByTime(1600); });
    const onLoading = map.on.mock.calls.filter(([event]) => event === 'sourcedataloading').at(-1)?.[1];
    await act(async () => {
      onLoading({ sourceId: 'satellite', coord: { canonical: { z: 12, x: 1, y: 2 } } });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(ready).toHaveBeenCalledWith('satellite', '12/1/2');
    unmount();
  });

  it('retains discovered requests across scans when the hidden map does not rediscover them', async () => {
    vi.useFakeTimers();
    const images: Array<{ onload: (() => void) | null; src: string }> = [];
    class PendingImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private url = '';
      set src(value: string) { this.url = value; images.push(this); }
      get src() { return this.url; }
    }
    vi.stubGlobal('Image', PendingImage);
    const { unmount } = renderHook(() => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58], [1.85, 41.60]], animationPhase: 'playing', cameraMode: 'follow',
      diagnostics: NOOP_TILE_PRELOAD_OBSERVER, elevationData: [], enabled: true,
      followBehindZoomLevel: 33, isMapLoaded: true, isPlaying: true, mapStyle: 'satellite',
      visibleMapRef: { current: null }, playbackProgress: 0, playbackSpeed: 1, totalDurationMs: 60000,
    }));
    const loadListener = map.once.mock.calls.find(([event]) => event === 'style.load')?.[1];
    act(() => { loadListener(); vi.advanceTimersByTime(1600); });
    const onLoading = map.on.mock.calls.find(([event]) => event === 'sourcedataloading')?.[1];
    act(() => {
      for (let y = 0; y < 7; y++) onLoading({ sourceId: 'satellite', coord: { canonical: { z: 12, x: 1, y } } });
    });
    expect(images).toHaveLength(6);
    await act(async () => { await vi.advanceTimersByTimeAsync(3200); });
    await act(async () => { images[0].onload?.(); await Promise.resolve(); });
    expect(images).toHaveLength(7);
    expect(images[6].src).toContain('/12/6/1');
    unmount();
  });

  it('requests the zoom path to an upcoming place overview', async () => {
    vi.useFakeTimers();
    const feature = { type: 'Feature' as const, properties: { id: 'place', name: 'Place', iso3: 'ESP', credit: 'source' },
      geometry: { type: 'Polygon' as const, coordinates: [[[1, 41], [2, 41], [2, 42], [1, 42], [1, 41]]] } };
    const { unmount } = renderHook(() => useReplayTileWarmup({
      allCoordinates: [[1.83, 41.58], [1.85, 41.60]], animationPhase: 'playing', cameraMode: 'follow',
      diagnostics: NOOP_TILE_PRELOAD_OBSERVER, elevationData: [], enabled: true, followBehindZoomLevel: 33,
      isMapLoaded: true, isPlaying: true, mapStyle: 'satellite', visibleMapRef: { current: null },
      playbackProgress: 0, playbackSpeed: 1, totalDurationMs: 95000, locationFeatures: [feature], zoomToPlace: true,
    }));
    const loadListener = map.once.mock.calls.find(([event]) => event === 'style.load')?.[1];
    act(() => { loadListener(); vi.advanceTimersByTime(1500); });
    expect(map.jumpTo.mock.calls[0][0]).toEqual(expect.objectContaining({ center: [1.83, 41.58] }));
    for (let i = 0; i < 26; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    }
    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 5, pitch: 0 }));
    unmount();
  });

});
