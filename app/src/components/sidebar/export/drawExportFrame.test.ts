import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { mapGlobalRef } from '@/utils/mapRef';
import { DEFAULT_SKY_COLOR } from '@/components/map/mapSky';
import { MAP_STYLE } from '@/components/map/mapStyle';
import { drawExportFrame } from './drawExportFrame';
import { createDefaultVideoExportSettings } from '@/store/defaults';

function frameOptions() {
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  const options: Parameters<typeof drawExportFrame>[0] = {
    recordingCanvasRef: { current: document.createElement('canvas') },
    recordingContextRef: { current: context as unknown as CanvasRenderingContext2D },
    videoExportSettings: { ...createDefaultVideoExportSettings(), resolution: { width: 1080, height: 1920 } },
    cachedOverlayRef: { current: null }, drawVideoFrame: vi.fn(), drawStatsValues: vi.fn(), drawElevationProgress: vi.fn(),
    svgMarkerImageCacheRef: { current: new Map() }, preloadSvgMarkerIcon: vi.fn(), getTrackLabel: () => null,
    cachedLogoRef: { current: null }, overlayLastUpdateRef: { current: Date.now() }, overlayBusyRef: { current: false },
    overlayFramesSinceRefreshRef: { current: 0 }, overlayRefreshIntervalMs: 1000,
    updateOverlayAsync: vi.fn(), t: (key) => key,
  };
  return { context, options };
}

beforeEach(() => {
  const container = document.createElement('div');
  container.id = 'map-capture-container';
  container.getBoundingClientRect = () => new DOMRect(0, 0, 1080, 1920);
  document.body.appendChild(container);
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  mapGlobalRef.current = { getCanvas: () => canvas } as unknown as MapLibreMap;
});
afterEach(() => { document.body.replaceChildren(); mapGlobalRef.current = null; });

describe('opaque sky in replay exports', () => {
  it('replaces the previous frame before compositing transparent map pixels on every frame', () => {
    const { context, options } = frameOptions();
    drawExportFrame(options);
    drawExportFrame(options);
    expect(context.fillStyle).toBe(DEFAULT_SKY_COLOR);
    expect(context.fillRect.mock.calls).toEqual([[0, 0, 1080, 1920], [0, 0, 1080, 1920]]);
    const fills = context.fillRect.mock.invocationCallOrder;
    const maps = context.drawImage.mock.invocationCallOrder;
    expect(fills[0]).toBeLessThan(maps[0]);
    expect(maps[0]).toBeLessThan(fills[1]);
    expect(fills[1]).toBeLessThan(maps[1]);
  });

  it('uses the same blue while the map canvas is unavailable', () => {
    mapGlobalRef.current = null;
    const { context, options } = frameOptions();
    drawExportFrame(options);
    expect(context.fillStyle).toBe(DEFAULT_SKY_COLOR);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1920);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('defines opaque blue sky in the shared map style used by navigation, covers and playback', () => {
    expect(MAP_STYLE.sky['sky-color']).toBe(DEFAULT_SKY_COLOR);
    expect(MAP_STYLE.sky['horizon-color']).toBe(DEFAULT_SKY_COLOR);
    expect(MAP_STYLE.sky['sky-horizon-blend']).toBe(0);
    expect(MAP_STYLE.sky['fog-ground-blend']).toBe(1);
  });
});
