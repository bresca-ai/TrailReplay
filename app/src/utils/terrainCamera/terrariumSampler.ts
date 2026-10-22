import type { TerrainSampler, TerrainSamplerOptions, TerrainTile } from './types';
import { TERRAIN_PROVIDER } from './provider';

export const TERRARIUM_TILE_URL = TERRAIN_PROVIDER.tileUrl;
const DEFAULT_ZOOM = 12;
const DEFAULT_MAX_TILES = 64;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_TIME_BUDGET_MS = 12_000;

export function decodeTerrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** XYZ Web Mercator tile coordinate, with latitude clamped to the valid projection. */
export function slippyTileFor(lon: number, lat: number, zoom: number): { x: number; y: number; pixelX: number; pixelY: number } | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isInteger(zoom) || zoom < 0 || zoom > 15) return null;
  const n = 2 ** zoom;
  const wrappedLon = ((lon + 180) % 360 + 360) % 360 - 180;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const xFloat = ((wrappedLon + 180) / 360) * n;
  const latRad = safeLat * Math.PI / 180;
  const yFloat = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n;
  const x = Math.min(n - 1, Math.max(0, Math.floor(xFloat)));
  const y = Math.min(n - 1, Math.max(0, Math.floor(yFloat)));
  return { x, y, pixelX: (xFloat - Math.floor(xFloat)), pixelY: (yFloat - Math.floor(yFloat)) };
}

function tileKey(z: number, x: number, y: number): string { return `${z}/${x}/${y}`; }

/**
 * Bounded per-call sampler. Tiles are fetched only on demand, cached for this
 * sampler, and failed or out-of-budget samples remain unknown (null).
 */
export function createTerrariumSampler(options: TerrainSamplerOptions): TerrainSampler & { stats(): { tiles: number; failedTiles: number; exhausted: boolean } } {
  const zoom = options.zoom ?? DEFAULT_ZOOM;
  const maxTiles = Math.max(1, options.maxTiles ?? DEFAULT_MAX_TILES);
  const maxConcurrency = Math.max(1, options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);
  const deadline = Date.now() + Math.max(1, options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const cache = new Map<string, Promise<TerrainTile | null>>();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (options.signal?.aborted) controller.abort();
  let active = 0;
  let failedTiles = 0;
  let exhausted = false;
  const queue: Array<() => void> = [];
  const aborted = () => controller.signal.aborted;

  const runBounded = async <T>(task: () => Promise<T>): Promise<T | null> => {
    if (aborted() || Date.now() >= deadline) { exhausted = true; return null; }
    if (active >= maxConcurrency) await new Promise<void>((resolve) => queue.push(resolve));
    if (aborted() || Date.now() >= deadline) { exhausted = true; return null; }
    active++;
    const remaining = Math.max(1, deadline - Date.now());
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => { exhausted = true; controller.abort(); resolve(null); }, remaining);
      });
      return await Promise.race([task(), timeout]);
    }
    catch {
      if (Date.now() >= deadline || aborted()) exhausted = true;
      else failedTiles++;
      return null;
    }
    finally { if (timeoutId) clearTimeout(timeoutId); active--; queue.shift()?.(); }
  };

  const getTile = (x: number, y: number): Promise<TerrainTile | null> => {
    const key = tileKey(zoom, x, y);
    const existing = cache.get(key);
    if (existing) return existing;
    if (cache.size >= maxTiles || Date.now() >= deadline || aborted()) { exhausted = true; return Promise.resolve(null); }
    const promise = runBounded(() => options.fetchTile(zoom, x, y, controller.signal));
    cache.set(key, promise);
    return promise;
  };

  return {
    async sampleElevation(lon, lat) {
      const coord = slippyTileFor(lon, lat, zoom);
      if (!coord || aborted() || Date.now() >= deadline) { exhausted ||= Date.now() >= deadline; return null; }
      const n = 2 ** zoom;
      const initialTile = await getTile(coord.x, coord.y);
      if (!initialTile || initialTile.width < 2 || initialTile.height < 2) return null;
      // Raster samples are grid nodes. Neighbor reads can cross an XYZ tile edge,
      // so bilinear interpolation remains continuous at tile boundaries.
      const gx = coord.x + coord.pixelX;
      const gy = coord.y + coord.pixelY;
      const worldX = gx * initialTile.width - 0.5;
      const worldY = Math.max(0, Math.min(n * initialTile.height - 1, gy * initialTile.height - 0.5));
      const x0 = Math.floor(worldX), y0 = Math.floor(worldY);
      const fx = worldX - x0, fy = worldY - y0;
      const read = async (globalX: number, globalY: number): Promise<number | null> => {
        const tileX = Math.floor(globalX / initialTile.width);
        const tileY = Math.floor(globalY / initialTile.height);
        if (tileY < 0 || tileY >= n) return null;
        const tile = await getTile(((tileX % n) + n) % n, tileY);
        if (!tile || tile.width !== initialTile.width || tile.height !== initialTile.height
          || tile.rgba.length < tile.width * tile.height * 4) return null;
        const px = ((globalX % tile.width) + tile.width) % tile.width;
        const py = ((globalY % tile.height) + tile.height) % tile.height;
        const i = (py * tile.width + px) * 4;
        const a = tile.rgba[i + 3];
        if (a === 0) return null;
        const h = decodeTerrariumHeight(tile.rgba[i], tile.rgba[i + 1], tile.rgba[i + 2]);
        return Number.isFinite(h) && h !== -32768 ? h : null;
      };
      const [h00, h10, h01, h11] = await Promise.all([
        read(x0, y0), read(x0 + 1, y0), read(x0, y0 + 1), read(x0 + 1, y0 + 1),
      ]);
      if (h00 === null || h10 === null || h01 === null || h11 === null) return null;
      const top = h00 + (h10 - h00) * fx;
      const bottom = h01 + (h11 - h01) * fx;
      return top + (bottom - top) * fy;
    },
    stats: () => ({ tiles: cache.size, failedTiles, exhausted }),
  };
}

export type { TerrainTile };
