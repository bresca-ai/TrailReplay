import { describe, expect, it, vi } from 'vitest';
import {
  applyStudioMapPresentation,
  DEFAULT_MAX_TILE_ZOOM_LEVELS,
  DEFAULT_TILE_COUNT_RATIO,
  STUDIO_MAX_TILE_ZOOM_LEVELS,
  STUDIO_TILE_COUNT_RATIO,
} from './studioMapPresentation';

function createMap() {
  const paint = new Map([
    ['background:raster-fade-duration', 250],
    ['fallback-satellite:raster-fade-duration', 0],
  ]);
  return {
    getStyle: () => ({
      layers: [
        { id: 'background', type: 'raster' },
        { id: 'fallback-satellite', type: 'raster' },
        { id: 'route', type: 'line' },
      ],
    }),
    getPaintProperty: vi.fn((layerId: string, property: string) => paint.get(`${layerId}:${property}`)),
    getSource: vi.fn((sourceId: string) => (
      ['satellite', 'fallback-satellite'].includes(sourceId) ? {} : undefined
    )),
    setPaintProperty: vi.fn((layerId: string, property: string, value: unknown) => {
      paint.set(`${layerId}:${property}`, value as number);
    }),
    setSourceTileLodParams: vi.fn(),
  } as unknown as Parameters<typeof applyStudioMapPresentation>[0] & {
    setPaintProperty: ReturnType<typeof vi.fn>;
    setSourceTileLodParams: ReturnType<typeof vi.fn>;
  };
}

describe('applyStudioMapPresentation', () => {
  it('uses one detailed zoom level for the active primary and fallback basemaps', () => {
    const map = createMap();

    applyStudioMapPresentation(map, 'satellite');

    expect(map.setSourceTileLodParams).toHaveBeenNthCalledWith(
      1,
      STUDIO_MAX_TILE_ZOOM_LEVELS,
      STUDIO_TILE_COUNT_RATIO,
      'satellite',
    );
    expect(map.setSourceTileLodParams).toHaveBeenNthCalledWith(
      2,
      STUDIO_MAX_TILE_ZOOM_LEVELS,
      STUDIO_TILE_COUNT_RATIO,
      'fallback-satellite',
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'raster-fade-duration', 0);
  });

  it('restores interactive LOD and raster fades after export', () => {
    const map = createMap();
    const restore = applyStudioMapPresentation(map, 'satellite');

    restore();

    expect(map.setSourceTileLodParams).toHaveBeenCalledWith(
      DEFAULT_MAX_TILE_ZOOM_LEVELS,
      DEFAULT_TILE_COUNT_RATIO,
      'satellite',
    );
    expect(map.setSourceTileLodParams).toHaveBeenCalledWith(
      DEFAULT_MAX_TILE_ZOOM_LEVELS,
      DEFAULT_TILE_COUNT_RATIO,
      'fallback-satellite',
    );
    expect(map.setPaintProperty).toHaveBeenLastCalledWith(
      'background',
      'raster-fade-duration',
      250,
    );
  });

  it('falls back to the satellite presentation for an unknown style', () => {
    const map = createMap();

    applyStudioMapPresentation(map, 'custom');

    expect(map.setSourceTileLodParams).toHaveBeenCalledWith(
      STUDIO_MAX_TILE_ZOOM_LEVELS,
      STUDIO_TILE_COUNT_RATIO,
      'satellite',
    );
  });
});
