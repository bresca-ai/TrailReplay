import { describe, expect, it, vi } from 'vitest';
import {
  applyConsistentBasemapTileLod,
  BASEMAP_MAX_TILE_ZOOM_LEVELS,
  BASEMAP_TILE_COUNT_RATIO,
  createUniformBasemapTileZoomCalculator,
} from './basemapTileLod';

function createMap(sourceIds = ['satellite', 'fallback-satellite']) {
  const sources = new Map(sourceIds.map((sourceId) => [sourceId, {}]));
  return {
    getSource: vi.fn((sourceId: string) => sources.get(sourceId)),
    setSourceTileLodParams: vi.fn(),
  } as unknown as Parameters<typeof applyConsistentBasemapTileLod>[0] & {
    setSourceTileLodParams: ReturnType<typeof vi.fn>;
  };
}

describe('applyConsistentBasemapTileLod', () => {
  it('uses one zoom level for both layers of the active basemap', () => {
    const map = createMap();

    expect(applyConsistentBasemapTileLod(map, 'satellite')).toEqual([
      'satellite',
      'fallback-satellite',
    ]);
    expect(map.setSourceTileLodParams).toHaveBeenNthCalledWith(
      1,
      BASEMAP_MAX_TILE_ZOOM_LEVELS,
      BASEMAP_TILE_COUNT_RATIO,
      'satellite',
    );
    expect(map.setSourceTileLodParams).toHaveBeenNthCalledWith(
      2,
      BASEMAP_MAX_TILE_ZOOM_LEVELS,
      BASEMAP_TILE_COUNT_RATIO,
      'fallback-satellite',
    );
    expect((map.getSource('satellite') as { calculateTileZoom?: unknown }).calculateTileZoom)
      .toEqual(expect.any(Function));
  });

  it('keeps the near-field zoom stable across small camera corrections', () => {
    const calculate = createUniformBasemapTileZoomCalculator();

    expect(calculate(12.35, 100, 1, 1, 45)).toBe(12);
    expect(calculate(12.6, 0, 0, 0, 0)).toBe(12);
    expect(calculate(12.76, 0, 0, 0, 0)).toBe(13);
    expect(calculate(12.4, 0, 0, 0, 0)).toBe(13);
    expect(calculate(12.24, 0, 0, 0, 0)).toBe(12);
  });

  it('applies only sources that exist and falls back to satellite metadata', () => {
    const map = createMap(['satellite']);

    expect(applyConsistentBasemapTileLod(map, 'unknown')).toEqual(['satellite']);
    expect(map.setSourceTileLodParams).toHaveBeenCalledTimes(1);
  });
});
