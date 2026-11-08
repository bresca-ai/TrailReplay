const WORLD = 20037508.342789244;
const MAX_IMAGE_BYTES = 1024 * 1024;
const DAILY_LIMIT = 4000;
const MONTHLY_LIMIT = 20000;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' };
const error = (status) => new Response('Imagery unavailable', { status, headers });

async function limitedBytes(body) {
  if (!body) throw new Error('empty image');
  const reader = body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_IMAGE_BYTES) throw new Error('image too large');
      chunks.push(value);
    }
  } catch (failure) { await reader.cancel().catch(() => {}); throw failure; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (length < 8 || ![137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) throw new Error('invalid image');
  return bytes;
}

// Fixed upstream and layer: client input never controls a destination URL.
export async function onRequestGet(context) {
  const url = new URL(context.request.url), params = url.searchParams;
  if ([...params.keys()].some(k => !['date','z','x','y'].includes(k)) || ['date','z','x','y'].some(k => params.getAll(k).length !== 1)) return error(400);
  const date = params.get('date'), zs = params.get('z'), xs = params.get('x'), ys = params.get('y');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}$/.test(zs) || !/^\d{1,6}$/.test(xs) || !/^\d{1,6}$/.test(ys)) return error(400);
  const when = Date.parse(`${date}T00:00:00Z`), z = Number(zs), x = Number(xs), y = Number(ys);
  if (!Number.isFinite(when) || new Date(when).toISOString().slice(0,10) !== date || date < '2017-03-28' || when > Date.now() || z > 16 || x >= 2 ** z || y >= 2 ** z) return error(400);
  const instance = context.env?.SENTINEL_INSTANCE_ID;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instance ?? '') || !context.env?.LANDMARKS_DB?.prepare) return error(503);
  const cache = globalThis.caches?.default;
  // Canonicalize the key; avoid retaining unrelated request headers or secrets.
  const key = new Request(`${url.origin}/api/sentinel?date=${date}&z=${z}&x=${x}&y=${y}`);
  const hit = cache && await cache.match(key);
  if (hit) return hit;
  try {
    // One atomic database update caps cache misses globally per UTC day.
    const day = new Date().toISOString().slice(0,10);
    const quota = context.env.LANDMARKS_DB.prepare('INSERT INTO sentinel_quota (period, requests) VALUES (?, 1) ON CONFLICT(period) DO UPDATE SET requests = requests + 1 WHERE requests < ? RETURNING requests');
    const daily = await quota.bind(`day:${day}`, DAILY_LIMIT).first();
    if (!daily) return error(429);
    const monthly = await quota.bind(`month:${day.slice(0,7)}`, MONTHLY_LIMIT).first();
    if (!monthly) return error(429);
    const size = 2 * WORLD / 2 ** z;
    const bbox = [-WORLD + x * size, WORLD - (y + 1) * size, -WORLD + (x + 1) * size, WORLD - y * size];
    const query = new URLSearchParams({ SERVICE:'WMS', VERSION:'1.1.1', REQUEST:'GetMap', LAYERS:'TRUE_COLOR', SRS:'EPSG:3857', BBOX:bbox.join(','), WIDTH:'256', HEIGHT:'256', FORMAT:'image/png', TRANSPARENT:'true', TIME:`${date}/${date}`, MAXCC:'20' });
    const upstream = await fetch(`https://sh.dataspace.copernicus.eu/ogc/wms/${instance}?${query}`, { redirect:'error', signal:AbortSignal.timeout(20000) });
    if (!upstream.ok || !upstream.headers.get('content-type')?.toLowerCase().startsWith('image/png')) return error(502);
    const body = await limitedBytes(upstream.body);
    const result = new Response(body, { headers: { ...headers, 'Content-Type':'image/png', 'Cache-Control':'public, max-age=86400' } });
    if (cache) context.waitUntil(cache.put(key, result.clone()));
    return result;
  } catch { return error(502); }
}
