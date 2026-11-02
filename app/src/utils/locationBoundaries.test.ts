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
