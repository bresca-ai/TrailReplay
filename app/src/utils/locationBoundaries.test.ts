import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { containsPosition, countryEmoji } from './locationBoundaries';
const feature: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
  [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
  [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
] } };
describe('location boundaries', () => {
  it('detects points inside the outer ring and outside holes', () => {
    expect(containsPosition(feature, [0.5, 0.5])).toBe(true);
    expect(containsPosition(feature, [1.5, 1.5])).toBe(false);
    expect(containsPosition(feature, [5, 5])).toBe(false);
  });
  it('constructs flags for two-letter country codes', () => {
    expect(countryEmoji('ES')).toBe('🇪🇸');
    expect(countryEmoji('FR')).toBe('🇫🇷');
    expect(countryEmoji('ESP')).toBe('');
  });
});

it('loads the requested country layer from the pinned media URL and reuses it', async () => {
  const { vi } = await import('vitest');
  const { loadRouteBoundaries } = await import('./locationBoundaries');
  const country = { ...feature, properties: { name: 'Example', iso2: 'ES', iso3: 'ESP' } };
  const data = { type: 'FeatureCollection', features: [{ ...feature, properties: { shapeName: 'Example', shapeID: 'example' } }] };
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('location-countries.geojson')) return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [country] }) };
    if (url.includes('/api/')) return { ok: true, json: async () => ({ simplifiedGeometryGeoJSON: 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/ESP/ADM1/example.geojson', boundarySource: 'source', boundaryLicense: 'CC BY 4.0' }) };
    if (url.startsWith('https://media.githubusercontent.com/media/')) return { ok: true, json: async () => data };
    throw new Error(`Unexpected URL ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  try {
    const result = await loadRouteBoundaries([[.5, .5]], 'region');
    expect(result[0].properties).toMatchObject({ name: 'Example', iso2: 'ES', credit: 'geoBoundaries · source · CC BY 4.0' });
    await loadRouteBoundaries([[.5, .5]], 'region');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  } finally { vi.unstubAllGlobals(); }
});

it('loads available local levels even when another country has no data', async () => {
  const { vi } = await import('vitest');
  vi.resetModules();
  const { loadRouteBoundaries } = await import('./locationBoundaries');
  const country = (name: string, iso3: string, x: number) => ({ type: 'Feature', properties: { name, iso2: 'ES', iso3 }, geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('location-countries.geojson')) return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [country('Spain', 'ESP', 0), country('France', 'FRA', 1)] }) };
    if (url.startsWith('https://media.githubusercontent.com/')) return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ ...feature, properties: { shapeName: 'Town', shapeID: 'town' } }] }) };
    if (url.includes('/FRA/ADM3/')) return { ok: false, status: 404 };
    if (url.includes('/ESP/ADM3/')) return { ok: true, json: async () => ({ simplifiedGeometryGeoJSON: 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/ESP/ADM3/example.geojson', boundarySource: 'source', boundaryLicense: 'CC BY 4.0' }) };
    throw new Error(`Unexpected URL ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  try {
    const missing = vi.fn();
    const result = await loadRouteBoundaries([[.5, .5], [1.5, .5]], 'adm3', missing);
    expect(result.map(item => item.properties.name)).toEqual(['Town']);
    expect(missing).toHaveBeenCalledWith(['France']);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/ESP/ADM3/'), expect.anything());
  } finally { vi.unstubAllGlobals(); }
});

it('treats a missing start level differently from a temporary provider failure', async () => {
  const { vi } = await import('vitest');
  vi.resetModules();
  const { loadLocationAtPosition } = await import('./locationBoundaries');
  const country = { ...feature, properties: { name: 'Spain', iso2: 'ES', iso3: 'ESP' } };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('location-countries.geojson')) return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [country] }) };
    return { ok: false, status: url.includes('/ADM4/') ? 404 : 503 };
  }));
  try {
    await expect(loadLocationAtPosition([.5, .5], 'adm4')).resolves.toBeUndefined();
    await expect(loadLocationAtPosition([.5, .5], 'adm5')).rejects.toThrow('503');
  } finally { vi.unstubAllGlobals(); }
});
