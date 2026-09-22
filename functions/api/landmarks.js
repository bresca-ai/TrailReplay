import { readJsonBody, RequestBodyTooLargeError } from '../../functions-lib/http.js';

// Public global instances listed by OpenStreetMap. The primary can reject
// otherwise valid POSTs (or be busy), so a cold lookup needs a second source.
const OVERPASS_ENDPOINTS = [
  { url: 'https://overpass.openstreetmap.fr/api/interpreter', timeoutMs: 15_000 },
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 6_000 },
  { url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', timeoutMs: 20_000 },
];
const MAX_POINTS = 180;
const MAX_SPAN_DEGREES = 1.5;
const ROUTE_PADDING = { lat: 0.015, lon: 0.02 };
const TILE_SIZE_DEGREES = 0.25;
const MAX_CACHE_TILES = 64;
const CACHE_SECONDS = 60 * 60 * 24;
const TILE_CACHE_SECONDS = 60 * 60 * 24 * 30;
const CACHE_VERSION = 1;

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}`, ...headers } });
}

function normalizeElement(element) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !tags.name) return null;
  const type = tags.natural === 'peak' ? 'summit'
    : tags.natural === 'saddle' || tags.mountain_pass ? 'pass'
      : tags.tourism === 'viewpoint' ? 'viewpoint'
        : tags.tourism === 'alpine_hut' ? 'hut'
          : tags.amenity === 'shelter' ? 'shelter'
            : tags.waterway === 'waterfall' || tags.natural === 'waterfall' ? 'waterfall'
              : tags.natural === 'water' || tags.water === 'lake' ? 'lake'
                : tags.place ? 'town' : null;
  if (!type) return null;
  const importance = type === 'summit' || type === 'pass' || type === 'town' ? 4 : 3;
  // Keep cache records compact: rendering only needs the stable OSM ID, not
  // every raw OSM tag returned by Overpass.
  return { id: `osm-${element.type}-${element.id}`, type, source: 'enriched', display: 'subtle', lat, lon, title: tags.name, subtitle: tags.ele ? `${tags.ele} m` : undefined, importance, metadata: { osmId: `${element.type}/${element.id}` } };
}

function queryFor(bounds) {
  const [south, west, north, east] = bounds;
  const filters = [
    'nwr["natural"="peak"]["name"]', 'nwr["natural"="saddle"]["name"]',
    'nwr["tourism"="viewpoint"]["name"]', 'nwr["tourism"="alpine_hut"]["name"]',
    'nwr["waterway"="waterfall"]["name"]', 'nwr["natural"="waterfall"]["name"]', 'nwr["water"="lake"]["name"]',
    'nwr["place"~"^(city|town|village|hamlet)$"]["name"]',
  ].map((filter) => `${filter}(${south},${west},${north},${east});`).join('');
  return `[out:json][timeout:8];(${filters});out center tags;`;
}

function routeBounds(points) {
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [Math.min(...lats) - ROUTE_PADDING.lat, Math.min(...lons) - ROUTE_PADDING.lon, Math.max(...lats) + ROUTE_PADDING.lat, Math.max(...lons) + ROUTE_PADDING.lon];
}

function isValidRoutePoint(point) {
  return Array.isArray(point)
    && point.length === 2
    && Number.isFinite(point[0])
    && point[0] >= -180
    && point[0] <= 180
    && Number.isFinite(point[1])
    && point[1] >= -90
    && point[1] <= 90;
}

function tileIndex(value) {
  return Math.floor(value / TILE_SIZE_DEGREES);
}

function tileKey(latIndex, lonIndex) {
  return `landmarks:v${CACHE_VERSION}:tile:${latIndex}:${lonIndex}`;
}

function tileBounds(latIndex, lonIndex) {
  const south = latIndex * TILE_SIZE_DEGREES;
  const west = lonIndex * TILE_SIZE_DEGREES;
  return [south, west, south + TILE_SIZE_DEGREES, west + TILE_SIZE_DEGREES];
}

function tilesForBounds(bounds) {
  const [south, west, north, east] = bounds;
  const tiles = [];
  // A bound ending exactly on a grid line does not need the next tile.
  const lastLat = tileIndex(north - 1e-9);
  const lastLon = tileIndex(east - 1e-9);
  for (let lat = tileIndex(south); lat <= lastLat; lat += 1) {
    for (let lon = tileIndex(west); lon <= lastLon; lon += 1) {
      tiles.push({ lat, lon, key: tileKey(lat, lon), bounds: tileBounds(lat, lon) });
    }
  }
  return tiles;
}

function contains(bounds, landmark) {
  return landmark.lat >= bounds[0] && landmark.lat <= bounds[2] && landmark.lon >= bounds[1] && landmark.lon <= bounds[3];
}

function mergeLandmarks(records) {
  const unique = new Map();
  for (const record of records) {
    for (const landmark of record.landmarks || []) unique.set(landmark.id, landmark);
  }
  return [...unique.values()];
}

async function mapInBatches(items, callback, batchSize = 6) {
  const results = [];
  for (let start = 0; start < items.length; start += batchSize) {
    results.push(...await Promise.all(items.slice(start, start + batchSize).map(callback)));
  }
  return results;
}

function hasGlobalTileCache(context) {
  return typeof context.env?.LANDMARK_CACHE?.get === 'function' && typeof context.env?.LANDMARK_CACHE?.put === 'function';
}

function hasLandmarkDatabase(context) {
  return typeof context.env?.LANDMARKS_DB?.prepare === 'function';
}

async function hasCompleteLandmarkDatabase(context) {
  const result = await context.env.LANDMARKS_DB.prepare(
    "SELECT value FROM landmark_dataset WHERE dataset_key = 'world-import-complete'",
  ).first();
  return result?.value === 'true';
}

function databaseTileKey(tile) {
  return `${tile.lat}:${tile.lon}`;
}

function normalizeDatabaseLandmark(row) {
  return {
    id: `osm-${row.osm_type}-${row.osm_id}`,
    type: row.kind,
    source: 'enriched',
    display: 'subtle',
    lat: row.lat,
    lon: row.lon,
    title: row.name,
    subtitle: row.elevation === null ? undefined : `${row.elevation} m`,
    importance: row.kind === 'summit' || row.kind === 'pass' || row.kind === 'town' ? 4 : 3,
    metadata: { osmId: `${row.osm_type}/${row.osm_id}` },
  };
}

async function lookupWithLandmarkDatabase(context, tiles, bounds) {
  const tileKeys = tiles.map(databaseTileKey);
  // D1 has a 100-parameter limit. The route cap produces at most 64 tiles,
  // so this chunk size also leaves room for the precise bounding rectangle.
  const rows = [];
  for (let start = 0; start < tileKeys.length; start += 80) {
    const chunk = tileKeys.slice(start, start + 80);
    const placeholders = chunk.map(() => '?').join(',');
    const result = await context.env.LANDMARKS_DB.prepare(
      `SELECT osm_type, osm_id, kind, name, lat, lon, elevation
       FROM landmarks
       WHERE tile_key IN (${placeholders})
         AND lat >= ? AND lat <= ? AND lon >= ? AND lon <= ?
       LIMIT 5000`,
    ).bind(...chunk, bounds[0], bounds[2], bounds[1], bounds[3]).all();
    rows.push(...(result.results || []));
  }
  return {
    landmarks: rows.map(normalizeDatabaseLandmark),
    coverage: { complete: true, source: 'landmark-database', tiles: tiles.length, cacheHits: tiles.length, fetchedTiles: 0 },
  };
}

async function readTiles(cache, tiles) {
  const values = await cache.get(tiles.map((tile) => tile.key), { type: 'json', cacheTtl: CACHE_SECONDS });
  return tiles.map((tile) => ({ tile, record: values.get(tile.key) })).filter(({ record }) => record?.version === CACHE_VERSION && record.complete === true);
}

async function fetchLandmarks(bounds) {
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'TrailReplay/1.0 (+https://trailreplay.app)' },
        body: new URLSearchParams({ data: queryFor(bounds) }),
        signal: AbortSignal.timeout(endpoint.timeoutMs),
      });
      if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.elements)) throw new Error('Overpass returned invalid data');
      return payload.elements.map(normalizeElement).filter(Boolean);
    } catch (error) {
      lastError = error;
      console.warn('Nearby-place provider failed; trying another', endpoint.url, error);
    }
  }
  throw new Error(`Nearby-place service is temporarily unavailable: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
}

function exactRouteCacheKey(request, points) {
  return new Request(`${new URL(request.url).origin}/api/landmarks-cache/${points.map((point) => point.join(',')).join(';')}`);
}

async function lookupWithRouteCache(context, points, bounds) {
  // This is the final, availability-first fallback. It deliberately does not
  // depend on a D1 or KV binding, so a binding outage still leaves the nearby
  // places feature usable through Overpass.
  const cache = globalThis.caches?.default;
  const key = cache ? exactRouteCacheKey(context.request, points) : null;
  const cached = key ? await cache.match(key) : null;
  if (cached) return cached;
  const landmarks = await fetchLandmarks(bounds);
  const result = json({ landmarks, attribution: '© OpenStreetMap contributors', coverage: { complete: true, source: 'route-cache', tiles: 1, cacheHits: 0, fetchedTiles: 1 } });
  if (cache && key) context.waitUntil(cache.put(key, result.clone()));
  return result;
}

async function lookupWithGlobalCache(context, tiles) {
  const cache = context.env.LANDMARK_CACHE;
  const cached = await readTiles(cache, tiles);
  const cachedKeys = new Set(cached.map(({ tile }) => tile.key));
  const missingTiles = tiles.filter((tile) => !cachedKeys.has(tile.key));
  let storedTiles = 0;

  if (missingTiles.length) {
    // Fill a rectangular batch in one Overpass request, then split it into
    // independently reusable tiles. This keeps a cold 30 km route to one
    // upstream query while preserving exact, tile-level coverage guarantees.
    const minLat = Math.min(...missingTiles.map((tile) => tile.lat));
    const maxLat = Math.max(...missingTiles.map((tile) => tile.lat));
    const minLon = Math.min(...missingTiles.map((tile) => tile.lon));
    const maxLon = Math.max(...missingTiles.map((tile) => tile.lon));
    const batchTiles = [];
    for (let lat = minLat; lat <= maxLat; lat += 1) {
      for (let lon = minLon; lon <= maxLon; lon += 1) {
        batchTiles.push({ lat, lon, key: tileKey(lat, lon), bounds: tileBounds(lat, lon) });
      }
    }
    const batchBounds = [
      Math.min(...batchTiles.map((tile) => tile.bounds[0])),
      Math.min(...batchTiles.map((tile) => tile.bounds[1])),
      Math.max(...batchTiles.map((tile) => tile.bounds[2])),
      Math.max(...batchTiles.map((tile) => tile.bounds[3])),
    ];
    const fetchedLandmarks = await fetchLandmarks(batchBounds);
    const fetched = await mapInBatches(batchTiles, async (tile) => {
      const landmarks = fetchedLandmarks.filter((landmark) => contains(tile.bounds, landmark));
      const record = { version: CACHE_VERSION, complete: true, bounds: tile.bounds, landmarks, fetchedAt: new Date().toISOString() };
      await cache.put(tile.key, JSON.stringify(record), { expirationTtl: TILE_CACHE_SECONDS, metadata: { version: CACHE_VERSION, complete: true, landmarkCount: landmarks.length } });
      return { tile, record };
    });
    const fetchedByKey = new Map(fetched.map((entry) => [entry.tile.key, entry]));
    storedTiles = batchTiles.length;
    // Keep existing entries where possible, but include the new values for
    // every tile needed by this route.
    for (const tile of missingTiles) cached.push(fetchedByKey.get(tile.key));
  }

  return {
    landmarks: mergeLandmarks(cached.map(({ record }) => record)),
    coverage: {
      complete: true,
      source: missingTiles.length ? (cachedKeys.size ? 'shared-cache-and-overpass' : 'overpass') : 'shared-cache',
      tiles: tiles.length,
      cacheHits: cachedKeys.size,
      fetchedTiles: storedTiles,
    },
  };
}

// A browser navigation, stale client, or health check may issue GET. Keep the
// API contract explicit and JSON-shaped so clients do not try to parse the
// Cloudflare Pages HTML 404 as JSON. Coordinates belong in a POST body.
export function onRequestGet() {
  return json(
    { error: 'Method not allowed. Request nearby places with POST and a JSON points body.' },
    405,
    { Allow: 'POST' },
  );
}

export async function onRequestPost(context) {
  let body;
  try {
    // Keep accepting local/dev requests without a Content-Type header, as this
    // handler did before the shared byte-limited reader was added.
    body = await readJsonBody(context.request, { requireContentType: false });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: 'payload_too_large', message: 'Request body is too large' }, 413);
    }
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const points = body?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS || !points.every(isValidRoutePoint)) return json({ error: 'Expected 2–180 valid [longitude, latitude] points' }, 400);

  const bounds = routeBounds(points);
  if (bounds[2] - bounds[0] > MAX_SPAN_DEGREES || bounds[3] - bounds[1] > MAX_SPAN_DEGREES) return json({ error: 'Route corridor is too large for nearby-place lookup' }, 400);
  const tiles = tilesForBounds(bounds);
  if (tiles.length > MAX_CACHE_TILES) return json({ error: 'Route corridor is too large for nearby-place lookup' }, 400);

  try {
    // The database binding is deployed before its first planet import. Until
    // that import marks itself complete, serve the existing complete source
    // instead of falsely claiming a partial/empty world database is complete.
    if (hasLandmarkDatabase(context)) {
      try {
        if (await hasCompleteLandmarkDatabase(context)) {
          const result = await lookupWithLandmarkDatabase(context, tiles, bounds);
          return json({ ...result, attribution: '© OpenStreetMap contributors' });
        }
      } catch (error) {
        // A D1 read failure must not make this optional enrichment unavailable.
        // Continue to the cache/API path below; keep the original exception in
        // Worker logs for diagnosis without exposing it to the client.
        console.error('Landmark database lookup failed; falling back', error);
      }
    }
    if (hasGlobalTileCache(context)) {
      try {
        const result = await lookupWithGlobalCache(context, tiles);
        return json({ ...result, attribution: '© OpenStreetMap contributors' });
      } catch (error) {
        // KV is an optimization, not a dependency. A cache failure should use
        // the live provider exactly as deployments without the binding do.
        console.error('Landmark cache lookup failed; falling back', error);
      }
    }

    // Local development and binding failures use the exact-route edge cache
    // and then the live provider. Production normally returns earlier from D1.
    return await lookupWithRouteCache(context, points, bounds);
  } catch (error) {
    console.error('Landmark enrichment error', error);
    return json({ error: error instanceof Error ? error.message : 'Nearby-place service is temporarily unavailable' }, 502);
  }
}
