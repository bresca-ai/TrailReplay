import { AJAXError } from 'maplibre-gl';
// Retain route-adjacent responses independently of the browser HTTP cache.
// MapLibre's much smaller decoded-tile cache can then be rebuilt without
// downloading those responses again on every replay.
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;
const entries = new Map<string, { data: Blob; size: number; expiresAt: number }>();
let bytes = 0;
let evictionVersion = 0;
let hits = 0;
let misses = 0;
let routeHits = 0;
let routeMisses = 0;
const routeUrls = new Set<string>();

class UncacheableTileError extends Error { readonly retryable = false; }

function evict(url: string): void {
  const entry = entries.get(url);
  if (!entry) return;
  entries.delete(url);
  bytes -= entry.size;
  if (routeUrls.has(url)) evictionVersion++;
}

function getRetainedTile(url: string): Blob | undefined {
  const entry = entries.get(url);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) { evict(url); return undefined; }
  entries.delete(url);
  entries.set(url, entry);
  return entry.data;
}

export function hasRetainedTile(url: string): boolean { return Boolean(getRetainedTile(url)); }

export function routeTileCacheVersion(): number {
  for (const [url, entry] of entries) if (Date.now() >= entry.expiresAt) evict(url);
  return evictionVersion;
}
export function resetRouteTileCacheStats(): void { hits = 0; misses = 0; routeHits = 0; routeMisses = 0; }
export function beginRouteTilePreload(): void { routeUrls.clear(); }
export function markRouteTile(url: string): void { routeUrls.add(url); }
export function routeTileCacheStats() { return { hits, misses, routeHits, routeMisses, entries: entries.size, bytes }; }

function cacheLifetime(response: Response): number {
  const cacheControl = response.headers?.get('cache-control') ?? '';
  if (/\b(?:no-store|no-cache)\b/i.test(cacheControl)) return 0;
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(cacheControl);
  const ageSeconds = Number(response.headers?.get('age') ?? 0);
  if (maxAge) return Math.min(DEFAULT_MAX_AGE_MS, Math.max(0, Number(maxAge[1]) - (Number.isFinite(ageSeconds) ? ageSeconds : 0)) * 1000);
  const expires = Date.parse(response.headers?.get('expires') ?? '');
  return Number.isFinite(expires) ? Math.min(DEFAULT_MAX_AGE_MS, Math.max(0, expires - Date.now())) : DEFAULT_MAX_AGE_MS;
}

function storeTile(url: string, blob: Blob, maxAgeMs: number): void {
  if (maxAgeMs <= 0 || blob.size > MAX_CACHE_BYTES || hasRetainedTile(url)) return;
  while (bytes + blob.size > MAX_CACHE_BYTES && entries.size > 0) {
    const oldest = [...entries.keys()].find(key => !routeUrls.has(key)) ?? entries.keys().next().value;
    if (!oldest) break;
    evict(oldest);
  }
  entries.set(url, { data: blob, size: blob.size, expiresAt: Date.now() + maxAgeMs });
  bytes += blob.size;
}

export async function retainRouteTile(url: string, signal?: AbortSignal): Promise<void> {
  if (hasRetainedTile(url)) return;
  if (signal?.aborted) throw new Error('Tile request cancelled');
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 10000);
  let blob: Blob;
  let maxAgeMs: number;
  try {
    const response = await fetch(url, { mode: 'cors', signal: controller.signal });
    if (!response.ok) throw new Error(`Tile request failed (${response.status})`);
    maxAgeMs = cacheLifetime(response);
    if (maxAgeMs <= 0) throw new UncacheableTileError('Tile response has expired');
    blob = await response.blob();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
  if (signal?.aborted) throw new Error('Tile request cancelled');
  if (blob.size > MAX_CACHE_BYTES) throw new Error('Tile exceeds cache capacity');
  storeTile(url, blob, maxAgeMs);
}

function canCacheVisibleTile(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ['server.arcgisonline.com', 'clarity.maptiles.arcgis.com', 'a.tile.opentopomap.org', 's3.amazonaws.com'].includes(parsed.hostname);
  } catch { return false; }
}

/** Used by the visible map only; uncached tiles keep MapLibre's normal path. */
export function retainedTileRequest(url: string, resourceType?: string): { url: string } {
  if (resourceType !== 'Tile') return { url };
  const retained = hasRetainedTile(url);
  if (retained) hits++; else misses++;
  if (routeUrls.has(url)) {
    if (retained) routeHits++; else routeMisses++;
  }
  return { url: retained || canCacheVisibleTile(url) ? `trailcache://${encodeURIComponent(url)}` : url };
}

/** Return an independent buffer: MapLibre may transfer ownership to a worker. */
export async function readRetainedTile(protocolUrl: string, signal?: AbortSignal): Promise<{ data: ArrayBuffer; cacheControl?: string; expires?: string | null }> {
  const originalUrl = decodeURIComponent(protocolUrl.slice('trailcache://'.length));
  if (signal?.aborted) throw new Error('Tile request cancelled');
  const cached = getRetainedTile(originalUrl);
  if (cached) {
    const data = await cached.arrayBuffer();
    if (signal?.aborted) throw new Error('Tile request cancelled');
    const entry = entries.get(originalUrl);
    return { data, cacheControl: `max-age=${Math.max(0, Math.floor(((entry?.expiresAt ?? Date.now()) - Date.now()) / 1000))}` };
  }
  // An entry can expire or be evicted between transformRequest and this call.
  const response = await fetch(originalUrl, { mode: 'cors', signal });
  if (!response.ok) throw new AJAXError(response.status, response.statusText, originalUrl, await response.blob());
  const blob = await response.blob();
  if (signal?.aborted) throw new Error('Tile request cancelled');
  storeTile(originalUrl, blob, cacheLifetime(response));
  return { data: await blob.arrayBuffer(), cacheControl: response.headers?.get('cache-control') ?? undefined, expires: response.headers?.get('expires') ?? undefined };
}
