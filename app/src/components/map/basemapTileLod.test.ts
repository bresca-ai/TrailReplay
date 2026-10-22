import { describe, expect, it, vi } from 'vitest';
import {
  applyConsistentBasemapTileLod,
  BASEMAP_MAX_TILE_ZOOM_LEVELS,
  BASEMAP_TILE_COUNT_RATIO,
} from './basemapTileLod';

const budgetedCalculator = () => 10;

function createMap(sourceIds = ['satellite', 'fallback-satellite']) {
  const sources = new Map(sourceIds.map((sourceId) => [sourceId, { calculateTileZoom: undefined as unknown }]));
  return {
    getSource: vi.fn((sourceId: string) => sources.get(sourceId)),
    setSourceTileLodParams: vi.fn((_levels: number, _ratio: number, sourceId: string) => {
      // Model the public setter installing its budget-aware calculator.
      const source = sources.get(sourceId);
      if (source) source.calculateTileZoom = budgetedCalculator;
    }),
  } as unknown as Parameters<typeof applyConsistentBasemapTileLod>[0] & {
    setSourceTileLodParams: ReturnType<typeof vi.fn>;
  };
}

describe('applyConsistentBasemapTileLod', () => {
  it('keeps the budget-aware calculator installed for both basemap layers', () => {
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
      .toBe(budgetedCalculator);
    expect((map.getSource('fallback-satellite') as { calculateTileZoom?: unknown }).calculateTileZoom)
      .toBe(budgetedCalculator);
  });

  it('applies only sources that exist and falls back to satellite metadata', () => {
    const map = createMap(['satellite']);

    expect(applyConsistentBasemapTileLod(map, 'unknown')).toEqual(['satellite']);
    expect(map.setSourceTileLodParams).toHaveBeenCalledTimes(1);
  });
});
