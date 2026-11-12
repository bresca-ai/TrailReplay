import { describe, expect, it, vi } from 'vitest';
import { BASEMAP_MAX_TILE_ZOOM_LEVELS, BASEMAP_TILE_COUNT_RATIO } from '@/components/map/basemapTileLod';
import { applyStudioMapPresentation, STUDIO_MAX_TILE_ZOOM_LEVELS, STUDIO_TILE_COUNT_RATIO } from './studioMapPresentation';

function createMap() {
  const paint = new Map([
    ['background:raster-fade-duration', 250],
    ['fallback-satellite:raster-fade-duration', 0],
  ]);
  return {
    getSource: vi.fn((id: string) => id === 'esri-clarity' ? {} : undefined),
    setSourceTileLodParams: vi.fn(),
    getStyle: () => ({
      layers: [
        { id: 'background', type: 'raster' },
        { id: 'fallback-satellite', type: 'raster' },
        { id: 'route', type: 'line' },
      ],
    }),
    getPaintProperty: vi.fn((layerId: string, property: string) => paint.get(`${layerId}:${property}`)),
    setPaintProperty: vi.fn((layerId: string, property: string, value: unknown) => {
      paint.set(`${layerId}:${property}`, value as number);
    }),
  } as unknown as Parameters<typeof applyStudioMapPresentation>[0] & {
    setPaintProperty: ReturnType<typeof vi.fn>;
    setSourceTileLodParams: ReturnType<typeof vi.fn>;
  };
}

describe('applyStudioMapPresentation', () => {
  it('disables raster fading while preserving non-raster layers', () => {
    const map = createMap();

    applyStudioMapPresentation(map);

    expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'raster-fade-duration', 0);
    expect(map.setPaintProperty).not.toHaveBeenCalledWith('route', 'raster-fade-duration', 0);
  });

  it('restores raster fades after export', () => {
    const map = createMap();
    const restore = applyStudioMapPresentation(map);

    restore();

    expect(map.setPaintProperty).toHaveBeenLastCalledWith(
      'background',
      'raster-fade-duration',
      250,
    );
  });

  it('uses higher detail only for the active basemap and restores the preview policy', () => {
    const map = createMap();
    const restore = applyStudioMapPresentation(map, { highDetail: true, mapStyle: 'esri-clarity' });
    expect(map.setSourceTileLodParams).toHaveBeenCalledWith(STUDIO_MAX_TILE_ZOOM_LEVELS, STUDIO_TILE_COUNT_RATIO, 'esri-clarity');
    restore();
    expect(map.setSourceTileLodParams).toHaveBeenLastCalledWith(BASEMAP_MAX_TILE_ZOOM_LEVELS, BASEMAP_TILE_COUNT_RATIO, 'esri-clarity');
  });

  it('leaves tile detail unchanged when high detail is not enabled', () => {
    const map = createMap();
    applyStudioMapPresentation(map, { mapStyle: 'esri-clarity' });
    expect(map.setSourceTileLodParams).not.toHaveBeenCalled();
  });
});
