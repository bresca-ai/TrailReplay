const MAX_BATCH_POINTS = 160;
const MAX_BATCH_SPAN_DEGREES = 1.1;
export const MAX_NEARBY_PLACES_PER_ROUTE = 32;
export const MAX_NEARBY_PLACES_TOTAL = 120;
const DEFAULT_ROUTE_PLACE_BUCKETS = 16;

export interface LandmarkLookupPoint {
  lat: number;
  lon: number;
}

interface RoutePlaceCandidate {
  distanceMeters: number;
  importance: number;
  progress: number;
}

/**
 * Keeps a route's named places spread across its full length.
 *
 * Provider/database order has no geographic meaning. Taking the first N after
 * sorting only by importance used to fill the quota with equal-ranked towns
 * from one area. Progress buckets make coverage the primary constraint, while
 * importance and proximity decide which places represent each area.
 */
export function selectRouteWidePlaces<T extends RoutePlaceCandidate>(
  candidates: T[],
  limit = MAX_NEARBY_PLACES_PER_ROUTE,
  bucketCount = DEFAULT_ROUTE_PLACE_BUCKETS,
): T[] {
  if (limit <= 0 || candidates.length === 0) return [];
  const bucketTotal = Math.max(1, Math.min(Math.floor(bucketCount), limit));
  const buckets: Array<Array<{ candidate: T; index: number }>> = Array.from(
    { length: bucketTotal },
    () => [],
  );

  candidates.forEach((candidate, index) => {
    const progress = Math.max(0, Math.min(1, candidate.progress));
    const bucketIndex = Math.min(bucketTotal - 1, Math.floor(progress * bucketTotal));
    buckets[bucketIndex].push({ candidate, index });
  });
  buckets.forEach((bucket) => bucket.sort((left, right) => (
    right.candidate.importance - left.candidate.importance
    || left.candidate.distanceMeters - right.candidate.distanceMeters
    || left.index - right.index
  )));

  const selected: T[] = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let foundCandidate = false;
    for (const bucket of buckets) {
      const entry = bucket[round];
      if (!entry) continue;
      foundCandidate = true;
      selected.push(entry.candidate);
      if (selected.length === limit) break;
    }
    if (!foundCandidate) break;
  }

  return selected.sort((left, right) => left.progress - right.progress);
}

function sampleBatch(points: LandmarkLookupPoint[]): Array<[number, number]> {
  if (points.length <= MAX_BATCH_POINTS) {
    return points.map((point) => [Number(point.lon.toFixed(5)), Number(point.lat.toFixed(5))]);
  }
  const step = (points.length - 1) / (MAX_BATCH_POINTS - 1);
  return Array.from({ length: MAX_BATCH_POINTS }, (_, index) => {
    const point = points[Math.round(index * step)];
    return [Number(point.lon.toFixed(5)), Number(point.lat.toFixed(5))];
  });
}

export function buildLandmarkLookupBatches(
  routePoints: LandmarkLookupPoint[],
): Array<Array<[number, number]>> {
  if (routePoints.length < 2) return [];
  const batches: LandmarkLookupPoint[][] = [];
  let current: LandmarkLookupPoint[] = [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const point of routePoints) {
    const nextMinLat = Math.min(minLat, point.lat);
    const nextMaxLat = Math.max(maxLat, point.lat);
    const nextMinLon = Math.min(minLon, point.lon);
    const nextMaxLon = Math.max(maxLon, point.lon);
    const exceedsSpan = current.length >= 2 && (
      nextMaxLat - nextMinLat > MAX_BATCH_SPAN_DEGREES
      || nextMaxLon - nextMinLon > MAX_BATCH_SPAN_DEGREES
    );

    if (exceedsSpan) {
      batches.push(current);
      current = [current[current.length - 1], point];
      minLat = Math.min(current[0].lat, point.lat);
      maxLat = Math.max(current[0].lat, point.lat);
      minLon = Math.min(current[0].lon, point.lon);
      maxLon = Math.max(current[0].lon, point.lon);
      continue;
    }

    current.push(point);
    minLat = nextMinLat;
    maxLat = nextMaxLat;
    minLon = nextMinLon;
    maxLon = nextMaxLon;
  }

  if (current.length >= 2) batches.push(current);
  return batches.map(sampleBatch);
}

export function landmarkTrackSignature(
  track: { id: string; points: LandmarkLookupPoint[] },
): string {
  const first = track.points[0];
  const last = track.points[track.points.length - 1];
  return [
    track.id,
    track.points.length,
    first ? `${first.lat.toFixed(5)},${first.lon.toFixed(5)}` : '',
    last ? `${last.lat.toFixed(5)},${last.lon.toFixed(5)}` : '',
  ].join(':');
}

export function tracksNeedingLandmarkLookup<T extends {
  id: string;
  points: LandmarkLookupPoint[];
}>(
  tracks: T[],
  cachedSignatures: ReadonlyMap<string, string>,
): T[] {
  return tracks.filter((track) => (
    track.points.length >= 2
    && cachedSignatures.get(track.id) !== landmarkTrackSignature(track)
  ));
}
