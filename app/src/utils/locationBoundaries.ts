import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

export type LocationGeometry = Polygon | MultiPolygon;
export type LocationFeature = Feature<LocationGeometry, { name: string; iso2?: string; iso3: string; id: string; credit: string }>;
export const LOCATION_LEVELS = ['country', 'region', 'adm2', 'adm3', 'adm4', 'adm5'] as const;
export type LocationLevel = typeof LOCATION_LEVELS[number];
export function levelCode(level: LocationLevel): string {
  return level === 'country' ? 'ADM0' : level === 'region' ? 'ADM1' : level.toUpperCase();
}
type CountryFeature = Feature<LocationGeometry, { name: string; iso2: string; iso3: string }>;
const API = 'https://www.geoboundaries.org/api/current/gbOpen';
const cachedLayers = new Map<string, Promise<LocationFeature[]>>();
const cachedCountryLevels = new Map<string, Promise<Set<string>>>();
let countriesPromise: Promise<CountryFeature[]> | undefined;

const ringBounds = new WeakMap<Position[], [number, number, number, number]>();
class BoundaryHttpError extends Error {
  readonly status: number;
  constructor(status: number) { super(`Boundary data unavailable (${status})`); this.status = status; }
}
function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let bounds = ringBounds.get(ring);
  if (!bounds) {
    bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const point of ring) { bounds[0] = Math.min(bounds[0], point[0]); bounds[1] = Math.min(bounds[1], point[1]); bounds[2] = Math.max(bounds[2], point[0]); bounds[3] = Math.max(bounds[3], point[1]); }
    ringBounds.set(ring, bounds);
  }
  if (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3]) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function containsPosition(feature: Feature<LocationGeometry>, point: Position): boolean {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.some(([outer, ...holes]) => !!outer && pointInRing(point, outer) && !holes.some(ring => pointInRing(point, ring)));
}
export function countryEmoji(code: string | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...Array.from(code, char => 0x1f1e6 + char.charCodeAt(0) - 65));
}
async function json(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new BoundaryHttpError(response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}
export function loadCountryIndex(): Promise<CountryFeature[]> {
  if (!countriesPromise) countriesPromise = json(`${import.meta.env.BASE_URL}location-countries.geojson`)
    .then(data => (data as FeatureCollection<LocationGeometry, CountryFeature['properties']>).features)
    .catch(error => { countriesPromise = undefined; throw error; });
  return countriesPromise;
}
/** The country catalog is CORS-accessible even when an individual missing
 * level's 404 is not. Keep failures retryable instead of guessing coverage. */
function loadCountryLevels(iso: string): Promise<Set<string>> {
  if (!/^[A-Z]{3}$/.test(iso)) return Promise.reject(new Error('Country is unavailable'));
  let pending = cachedCountryLevels.get(iso);
  if (!pending) {
    pending = json(`${API}/${iso}/ALL/`).then(data => {
      if (!Array.isArray(data) || !data.every(item => item && typeof item === 'object'
        && item.boundaryISO === iso && typeof item.boundaryType === 'string' && /^ADM\d+$/.test(item.boundaryType))) {
        throw new Error('Invalid boundary catalog');
      }
      return new Set(data.map(item => item.boundaryType as string));
    }).catch(error => { cachedCountryLevels.delete(iso); throw error; });
    cachedCountryLevels.set(iso, pending);
  }
  return pending;
}
/** GeoBoundaries supplies metadata and a versioned file URL, not a spatial API. */
export function loadBoundaryLayer(country: CountryFeature, level: LocationLevel): Promise<LocationFeature[]> {
  const iso = country.properties.iso3;
  if (!/^[A-Z]{3}$/.test(iso)) return Promise.reject(new Error('Country is unavailable'));
  const key = `${iso}:${level}`;
  let pending = cachedLayers.get(key);
  if (!pending) {
    pending = (async () => {
      const metadata = await json(`${API}/${iso}/${levelCode(level)}/`) as Record<string, unknown>;
      const url = new URL(String(metadata.simplifiedGeometryGeoJSON));
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith('/wmgeolab/geoBoundaries/')) throw new Error('Invalid boundary source');
      // GitHub's redirect lacks CORS headers. The equivalent media URL serves
      // the same commit-pinned Git LFS content with a browser CORS header.
      const path = url.pathname.match(/^\/wmgeolab\/geoBoundaries\/raw\/([0-9a-f]{7,40})\/(releaseData\/gbOpen\/.*\.geojson)$/);
      if (!path) throw new Error('Invalid boundary source');
      const collection = await json(`https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${path[1]}/${path[2]}`) as FeatureCollection<LocationGeometry, Record<string, string>>;
      if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Invalid boundary data');
      return collection.features.filter(feature => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon').map((feature, index) => ({
        type: 'Feature' as const, geometry: feature.geometry,
        properties: { id: feature.properties?.shapeID ?? `${iso}-${index}`, name: level === 'country' ? country.properties.name : feature.properties?.shapeName ?? country.properties.name,
          iso2: country.properties.iso2, iso3: iso, credit: `geoBoundaries · ${String(metadata.boundarySource ?? "")} · ${String(metadata.boundaryLicense ?? "")}` },
      }));
    })().catch(error => { cachedLayers.delete(key); throw error; });
    cachedLayers.set(key, pending);
  }
  return pending;
}
/** Resolve a single route point without treating a transient request failure as missing coverage. */
export async function loadLocationAtPosition(point: Position, level: LocationLevel): Promise<LocationFeature | undefined> {
  const country = (await loadCountryIndex()).find(item => containsPosition(item, point));
  if (!country) return undefined;
  const levels = await loadCountryLevels(country.properties.iso3);
  if (!levels.has(levelCode(level))) return undefined;
  try {
    return (await loadBoundaryLayer(country, level)).find(item => containsPosition(item, point));
  } catch (error) {
    if (error instanceof BoundaryHttpError && error.status === 404) return undefined;
    throw error;
  }
}
/** Finds countries from route points and fetches only those country layers.
 * The overview index is generalized; small islands and narrow crossings can be missed. */
export async function loadRouteBoundaries(points: Position[], level: LocationLevel, onMissing?: (countries: string[]) => void): Promise<LocationFeature[]> {
  const countries = await loadCountryIndex();
  const found = new Map<string, CountryFeature>();
  for (const point of points) {
    const match = countries.find(country => containsPosition(country, point));
    if (match) found.set(match.properties.iso3, match);
  }
  const queue = [...found.values()];
  const layers: LocationFeature[][] = Array.from({ length: queue.length });
  const missing: string[] = [];
  let next = 0;
  // Avoid flooding the public service when a long trip crosses many countries.
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (next < queue.length) { const index = next++; try { layers[index] = await loadBoundaryLayer(queue[index], level); } catch { missing.push(queue[index].properties.name); layers[index] = []; } }
  }));
  onMissing?.(missing);
  return layers.flat();
}
