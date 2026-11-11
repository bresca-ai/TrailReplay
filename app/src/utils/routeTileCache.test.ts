import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginRouteTilePreload, hasRetainedTile, markRouteTile, readRetainedTile, resetRouteTileCacheStats, retainRouteTile, retainedTileRequest, routeTileCacheStats, routeTileCacheVersion } from './routeTileCache';

afterEach(() => vi.unstubAllGlobals());

describe('route tile cache', () => {
  it('preserves HTTP status and freshness metadata for MapLibre', async () => {
    const source = 'https://server.arcgisonline.com/review-test';
    const request = retainedTileRequest(source, 'Tile');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found', blob: async () => new Blob() })
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ 'cache-control': 'max-age=30' }), blob: async () => new Blob(['tile']) }));
    await expect(readRetainedTile(request.url)).rejects.toMatchObject({ status: 404 });
    expect((await readRetainedTile(request.url)).cacheControl).toBe('max-age=30');
    expect((await readRetainedTile(request.url)).cacheControl).toMatch(/^max-age=(?:30|2[89])$/);
  });
  it('serves retained bytes to the map without creating object URLs', async () => {
    const source = 'https://tiles.example.test/retained/1';
    const fetchTile = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['tile']) });
    vi.stubGlobal('fetch', fetchTile);
    await retainRouteTile(source);
    await retainRouteTile(source);
    expect(fetchTile).toHaveBeenCalledTimes(1);
    expect(hasRetainedTile(source)).toBe(true);
    const request = retainedTileRequest(source, 'Tile');
    expect(request.url).toMatch(/^trailcache:\/\//);
    const first = await readRetainedTile(request.url);
    const second = await readRetainedTile(request.url);
    expect(new TextDecoder().decode(first.data)).toBe('tile');
    expect(first.data).not.toBe(second.data);
    expect(retainedTileRequest(source, 'Source')).toEqual({ url: source });
    vi.restoreAllMocks();
  });

  it('does not cache failed tile responses', async () => {
    const source = 'https://tiles.example.test/failed/1';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(retainRouteTile(source)).rejects.toThrow('503');
    expect(retainedTileRequest(source, 'Tile')).toEqual({ url: source });
  });

  it('expires a cached response according to the provider freshness lifetime', async () => {
    const source = 'https://tiles.example.test/expiry/1';
    beginRouteTilePreload();
    markRouteTile(source);
    const now = vi.spyOn(Date, 'now').mockReturnValue(100000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'cache-control': 'public, max-age=10', age: '3' }), blob: async () => new Blob(['tile']) }));
    await retainRouteTile(source);
    const version = routeTileCacheVersion();
    now.mockReturnValue(106999);
    expect(hasRetainedTile(source)).toBe(true);
    now.mockReturnValue(107000);
    expect(hasRetainedTile(source)).toBe(false);
    expect(routeTileCacheVersion()).toBeGreaterThan(version);
    vi.restoreAllMocks();
  });

  it('does not retain responses that prohibit caching', async () => {
    const source = 'https://tiles.example.test/no-store/1';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'cache-control': 'no-store' }), blob: async () => new Blob(['tile']) }));
    await expect(retainRouteTile(source)).rejects.toMatchObject({ retryable: false });
    expect(hasRetainedTile(source)).toBe(false);
  });

  it('falls back to the original provider if an entry expires after a map request is transformed', async () => {
    const source = 'https://tiles.example.test/race/1';
    const now = vi.spyOn(Date, 'now').mockReturnValue(100000);
    const fetchTile = vi.fn()
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ 'cache-control': 'max-age=1' }), blob: async () => new Blob(['cached']) })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['fresh']) });
    vi.stubGlobal('fetch', fetchTile);
    await retainRouteTile(source);
    const request = retainedTileRequest(source, 'Tile');
    now.mockReturnValue(101000);
    expect(new TextDecoder().decode((await readRetainedTile(request.url)).data)).toBe('fresh');
    expect(fetchTile.mock.calls[1][0]).toBe(source);
    vi.restoreAllMocks();
  });

  it('caches tiles first encountered by the visible map for the next replay', async () => {
    const source = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/123/456';
    const fetchTile = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => new Blob(['visible']) });
    vi.stubGlobal('fetch', fetchTile);
    const request = retainedTileRequest(source, 'Tile');
    expect(request.url).toMatch(/^trailcache:/);
    expect(new TextDecoder().decode((await readRetainedTile(request.url)).data)).toBe('visible');
    await readRetainedTile(retainedTileRequest(source, 'Tile').url);
    expect(fetchTile).toHaveBeenCalledTimes(1);
  });

  it('renders but does not retain visible tiles that prohibit caching', async () => {
    const source = 'https://server.arcgisonline.com/no-store-test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'cache-control': 'no-store' }), blob: async () => new Blob(['visible']) }));
    const request = retainedTileRequest(source, 'Tile');
    expect(new TextDecoder().decode((await readRetainedTile(request.url)).data)).toBe('visible');
    expect(hasRetainedTile(source)).toBe(false);
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
    expect(hasRetainedTile(source)).toBe(false);
  });

  it('distinguishes route cache misses from requests outside the route', () => {
    beginRouteTilePreload();
    resetRouteTileCacheStats();
    markRouteTile('https://tiles.example.test/route/missing');
    retainedTileRequest('https://tiles.example.test/route/missing', 'Tile');
    retainedTileRequest('https://tiles.example.test/far/missing', 'Tile');
    expect(routeTileCacheStats()).toMatchObject({ misses: 2, routeMisses: 1, routeHits: 0 });
  });

  it('evicts predicted view tiles before protected route tiles', async () => {
    vi.resetModules();
    const cache = await import('./routeTileCache');
    const route = 'https://tiles.example.test/protected';
    const firstView = 'https://tiles.example.test/view/1';
    const secondView = 'https://tiles.example.test/view/2';
    const blob = { size: 50 * 1024 * 1024 } as Blob;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));
    cache.beginRouteTilePreload();
    cache.markRouteTile(route);
    await cache.retainRouteTile(route);
    await cache.retainRouteTile(firstView);
    const version = cache.routeTileCacheVersion();
    await cache.retainRouteTile(secondView);
    expect(cache.hasRetainedTile(route)).toBe(true);
    expect(cache.hasRetainedTile(firstView)).toBe(false);
    expect(cache.hasRetainedTile(secondView)).toBe(true);
    expect(cache.routeTileCacheVersion()).toBe(version);
  });
});
