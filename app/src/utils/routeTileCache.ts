// Retain route-adjacent responses independently of the browser HTTP cache.
// MapLibre's much smaller decoded-tile cache can then be rebuilt without
// downloading those responses again on every replay.
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
const entries = new Map<string, { objectUrl: string; size: number }>();
let bytes = 0;
let evictionVersion = 0;
let hits = 0;
let misses = 0;
let routeHits = 0;
let routeMisses = 0;
const routeUrls = new Set<string>();

export function getRetainedTileUrl(url: string): string | undefined {
  const entry = entries.get(url);
  if (!entry) return undefined;
  entries.delete(url);
  entries.set(url, entry);
  return entry.objectUrl;
}

export function routeTileCacheVersion(): number { return evictionVersion; }
export function resetRouteTileCacheStats(): void { hits = 0; misses = 0; routeHits = 0; routeMisses = 0; }
export function beginRouteTilePreload(): void { routeUrls.clear(); }
export function markRouteTile(url: string): void { routeUrls.add(url); }
export function routeTileCacheStats() { return { hits, misses, routeHits, routeMisses, entries: entries.size, bytes }; }

export async function retainRouteTile(url: string, signal?: AbortSignal): Promise<void> {
  if (getRetainedTileUrl(url)) return;
  if (signal?.aborted) throw new Error('Tile request cancelled');
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 10000);
  let blob: Blob;
  try {
    const response = await fetch(url, { mode: 'cors', signal: controller.signal });
    if (!response.ok) throw new Error(`Tile request failed (${response.status})`);
    blob = await response.blob();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
  if (signal?.aborted) throw new Error('Tile request cancelled');
  if (blob.size > MAX_CACHE_BYTES) throw new Error('Tile exceeds cache capacity');
  // Another request can have stored the same URL while this fetch was in flight.
  if (getRetainedTileUrl(url)) return;
  while (bytes + blob.size > MAX_CACHE_BYTES && entries.size > 0) {
    const oldest = entries.keys().next().value;
    if (!oldest) break;
    const entry = entries.get(oldest)!;
    entries.delete(oldest);
    bytes -= entry.size;
    evictionVersion++;
    // A MapLibre worker may already be reading this URL.
    setTimeout(() => URL.revokeObjectURL(entry.objectUrl), 10000);
  }
  const objectUrl = URL.createObjectURL(blob);
  entries.set(url, { objectUrl, size: blob.size });
  bytes += blob.size;
}

/** Used by the visible map only; other requests keep MapLibre's normal path. */
export function retainedTileRequest(url: string, resourceType?: string): { url: string } {
  if (resourceType !== 'Tile') return { url };
  const retained = getRetainedTileUrl(url);
  if (retained) hits++; else misses++;
  if (routeUrls.has(url)) {
    if (retained) routeHits++; else routeMisses++;
  }
  return { url: retained ?? url };
}
