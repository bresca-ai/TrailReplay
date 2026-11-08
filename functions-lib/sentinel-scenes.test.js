import { afterEach, expect, it, vi } from 'vitest';
import { onRequestGet } from '../functions/api/sentinel-scenes.js';
afterEach(() => vi.unstubAllGlobals());
it('returns only dated low-cloud scenes with reported snow', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ features:[
    { properties:{ datetime:'2025-03-30T10:00:00Z', 'eo:cloud_cover':2, 'eo:snow_cover':27 } },
    { properties:{ datetime:'2025-03-28T10:00:00Z', 'eo:cloud_cover':90, 'eo:snow_cover':10 } },
    { properties:{ datetime:'2025-03-27T10:00:00Z', 'eo:cloud_cover':2, 'eo:snow_cover':0 } },
  ] })));
  const r = await onRequestGet({request:new Request('https://example.test/api/sentinel-scenes?lat=42.54&lon=1.73')});
  expect(r.status).toBe(200);
  expect((await r.json()).scenes).toEqual([{date:'2025-03-30',cloud:2,snow:27}]);
});
it('rejects malformed coordinates and does not query upstream', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch',fetcher);
  const r = await onRequestGet({request:new Request('https://example.test/api/sentinel-scenes?lat=&lon=1')});
  expect(r.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
});
