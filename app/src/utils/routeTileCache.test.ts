import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginRouteTilePreload, getRetainedTileUrl, markRouteTile, resetRouteTileCacheStats, retainRouteTile, retainedTileRequest, routeTileCacheStats } from './routeTileCache';

afterEach(() => vi.unstubAllGlobals());

describe('route tile cache', () => {
  it('retains tile bytes and hands the visible map the same local URL', async () => {
    const source = 'https://tiles.example.test/retained/1';
    const fetchTile = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['tile']) });
    vi.stubGlobal('fetch', fetchTile);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-retained');
    await retainRouteTile(source);
    await retainRouteTile(source);
    expect(fetchTile).toHaveBeenCalledTimes(1);
    expect(getRetainedTileUrl(source)).toBe('blob:test-retained');
    expect(retainedTileRequest(source, 'Tile')).toEqual({ url: 'blob:test-retained' });
    expect(retainedTileRequest(source, 'Source')).toEqual({ url: source });
    vi.restoreAllMocks();
  });

  it('does not cache failed tile responses', async () => {
    const source = 'https://tiles.example.test/failed/1';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(retainRouteTile(source)).rejects.toThrow('503');
    expect(retainedTileRequest(source, 'Tile')).toEqual({ url: source });
  });

  it('cancels an in-flight route tile when playback is stopped', async () => {
    const source = 'https://tiles.example.test/aborted/1';
    vi.stubGlobal('fetch', vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })));
    const controller = new AbortController();
    const pending = retainRouteTile(source, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(getRetainedTileUrl(source)).toBeUndefined();
  });

  it('distinguishes route cache misses from requests outside the route', () => {
    beginRouteTilePreload();
    resetRouteTileCacheStats();
    markRouteTile('https://tiles.example.test/route/missing');
    retainedTileRequest('https://tiles.example.test/route/missing', 'Tile');
    retainedTileRequest('https://tiles.example.test/far/missing', 'Tile');
    expect(routeTileCacheStats()).toMatchObject({ misses: 2, routeMisses: 1, routeHits: 0 });
  });
});
