import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { VisibleRasterWarmup } from './visibleRasterWarmup';

const id = { key: '12/1/2', wrapped() { return this; }, overscaleFactor() { return 1; } };
class FakeTile {
  state = 'loading';
  tileID: typeof id;
  size: number;
  constructor(tileID: typeof id, size: number) { this.tileID = tileID; this.size = size; }
  getExpiryTimeout() { return undefined; }
}
function fixture() {
  const cache = { has: vi.fn(() => false), add: vi.fn() };
  const source = { type: 'raster', tileSize: 256, loadTile: vi.fn(async (tile: FakeTile) => { tile.state = 'loaded'; }), unloadTile: vi.fn(), abortTile: vi.fn() };
  const manager = { _source: source, _outOfViewCache: cache, getTileByID: vi.fn(() => undefined) };
  const map = { style: { tileManagers: { satellite: manager } } } as unknown as MapLibreMap;
  return { cache, source, manager, map };
}

describe('visible raster warmup', () => {
  it('loads an imminent tile into the visible map cache', async () => {
    const { cache, source, map } = fixture();
    const warmer = new VisibleRasterWarmup(() => map, true);
    warmer.enqueue('satellite', id, FakeTile, 1);
    await vi.waitFor(() => expect(cache.add).toHaveBeenCalledOnce());
    expect(source.loadTile).toHaveBeenCalledOnce();
    expect(cache.add.mock.calls[0][0]).toBe(id);
    warmer.dispose();
  });
  it('skips already available tiles and unsupported renderer versions', () => {
    const { cache, source, map } = fixture();
    cache.has.mockReturnValue(true);
    new VisibleRasterWarmup(() => map, true).enqueue('satellite', id, FakeTile, 1);
    new VisibleRasterWarmup(() => map, false).enqueue('satellite', id, FakeTile, 1);
    expect(source.loadTile).not.toHaveBeenCalled();
  });
  it('discards a tile if its map is replaced before loading completes', async () => {
    const { cache, source, map } = fixture();
    let finish!: () => void;
    source.loadTile.mockImplementation(tile => new Promise(resolve => { finish = () => { tile.state = 'loaded'; resolve(); }; }));
    let current: MapLibreMap | null = map;
    const warmer = new VisibleRasterWarmup(() => current, true);
    warmer.enqueue('satellite', id, FakeTile, 1);
    await vi.waitFor(() => expect(source.loadTile).toHaveBeenCalledOnce());
    current = null;
    finish();
    await vi.waitFor(() => expect(source.unloadTile).toHaveBeenCalledOnce());
    expect(cache.add).not.toHaveBeenCalled();
    warmer.dispose();
  });
});
