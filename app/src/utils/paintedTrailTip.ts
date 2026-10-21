import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export const PAINTED_TRAIL_TIP_LAYER = 'trail-painted-tip';
export const PAINTED_TRAIL_TIP_KIND = 'playback-tip';

export type CompletedTrailData = Feature<LineString> | FeatureCollection<LineString>;

export function lastPaintedCoordinate(data: CompletedTrailData): [number, number] | null {
  const features = data.type === 'FeatureCollection' ? data.features : [data];
  for (let index = features.length - 1; index >= 0; index--) {
    const coordinate = features[index].geometry.coordinates.at(-1);
    if (coordinate) return [coordinate[0], coordinate[1]];
  }
  return null;
}

/** The tip and completed line must pass through the same worker and tile update. */
export function withPaintedTrailTip(
  data: CompletedTrailData,
  revision: number,
  startPosition: [number, number] | null = null,
): FeatureCollection<LineString | Point> {
  const features: Array<Feature<LineString | Point>> = data.type === 'FeatureCollection'
    ? [...data.features]
    : [data];
  const position = lastPaintedCoordinate(data) ?? startPosition;
  if (position) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: position },
      // Keep the original coordinate: tile geometry is quantized and changes
      // slightly at tile/zoom boundaries, which would introduce another wobble.
      properties: { kind: PAINTED_TRAIL_TIP_KIND, revision, lon: position[0], lat: position[1] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Old and new tiles may coexist; never let an older tile move the marker back. */
export function newestPaintedTrailTip(
  features: ReadonlyArray<{ properties: Record<string, unknown> | null }>,
  minimumRevision: number,
): { revision: number; position: [number, number] } | null {
  let newest: { revision: number; position: [number, number] } | null = null;
  for (const { properties: p } of features) {
    if (!p || p.kind !== PAINTED_TRAIL_TIP_KIND
      || typeof p.revision !== 'number' || !Number.isFinite(p.revision)
      || p.revision < minimumRevision || (newest && p.revision <= newest.revision)
      || typeof p.lon !== 'number' || !Number.isFinite(p.lon)
      || typeof p.lat !== 'number' || !Number.isFinite(p.lat)) continue;
    newest = { revision: p.revision, position: [p.lon, p.lat] };
  }
  return newest;
}
