// Search a small public area only; scene snow/cloud percentages describe the
// entire Sentinel granule, not a guarantee of snow at the requested location.
export async function onRequestGet(context) {
  const url = new URL(context.request.url), params = url.searchParams;
  const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': status === 200 ? 'public, max-age=86400' : 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } });
  if ([...params.keys()].some(k => !['lat','lon'].includes(k)) || ['lat','lon'].some(k => params.getAll(k).length !== 1)) return response({ error:'invalid_location' }, 400);
  if (!/^-?\d{1,3}(?:\.\d{1,6})?$/.test(params.get('lat')) || !/^-?\d{1,3}(?:\.\d{1,6})?$/.test(params.get('lon'))) return response({ error:'invalid_location' }, 400);
  const lat = Number(params.get('lat')), lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 83 || Math.abs(lon) > 179.9) return response({ error:'invalid_location' }, 400);
  const year = new Date().getUTCFullYear(), month = new Date().getUTCMonth() + 1;
  // Use the most recently completed winter so the request remains stable.
  const winterYear = lat >= 0 ? (month <= 4 ? year - 1 : year) : (month <= 9 ? year - 1 : year);
  const interval = lat >= 0 ? `${winterYear}-01-01T00:00:00Z/${winterYear}-04-15T23:59:59Z` : `${winterYear}-06-01T00:00:00Z/${winterYear}-09-30T23:59:59Z`;
  const stac = new URL('https://earth-search.aws.element84.com/v1/search');
  stac.search = new URLSearchParams({ collections:'sentinel-2-l2a', bbox:`${lon-0.01},${lat-0.01},${lon+0.01},${lat+0.01}`, datetime:interval, limit:'100' });
  try {
    const upstream = await fetch(stac, { redirect:'manual', signal:AbortSignal.timeout(15000) });
    if (!upstream.ok) return response({ error:'unavailable' }, 502);
    if (!upstream.body) return response({ error:'unavailable' }, 502);
    const reader = upstream.body.getReader(), decoder = new TextDecoder(); let text = '', bytes = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4_000_000) { await reader.cancel(); return response({ error:'unavailable' }, 502); } text += decoder.decode(part.value, { stream:true }); } text += decoder.decode(); }
    finally { reader.releaseLock(); }
    const data = JSON.parse(text);
    if (!Array.isArray(data.features)) return response({ error:'unavailable' }, 502);
    const days = new Map();
    for (const scene of data.features) {
      const p = scene?.properties, date = typeof p?.datetime === 'string' ? p.datetime.slice(0,10) : '', cloud = Number(p?.['eo:cloud_cover']), snow = Number(p?.['s2:snow_ice_percentage']);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(cloud) || cloud > 25 || !Number.isFinite(snow) || snow <= 0) continue;
      const previous = days.get(date); if (!previous || previous.cloud > cloud) days.set(date, { date, cloud, snow });
    }
    return response({ scenes:[...days.values()].sort((a,b) => b.date.localeCompare(a.date)).slice(0,20), coverage:'scene-wide' });
  } catch { return response({ error:'unavailable' }, 502); }
}
