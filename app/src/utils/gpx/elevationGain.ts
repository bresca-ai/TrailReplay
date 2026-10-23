/** Ignore altitude movements smaller than this noise floor. */
export const DEFAULT_ELEVATION_THRESHOLD_METERS = 10;
const SAMPLE_SPACING_METERS = 10;
// A 200 m spatial window suppresses short terrain/GPS oscillations consistently
// across devices. It is an estimate, not a reconstruction of a provider's DEM.
const MEDIAN_RADIUS_METERS = 100;
const MAX_PROFILE_SAMPLES = 100_000;

interface ElevationPoint { elevation: number; distance?: number }
interface ElevationProfile { distances: number[]; gains: number[]; losses: number[]; spatial: boolean }

// Tracks and computed journey legs are immutable. Reuse one filtered profile
// for totals and playback rather than filtering a different prefix every frame.
const profiles = new WeakMap<ElevationPoint[], Map<number, ElevationProfile>>();

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function accumulate(elevations: number[], threshold: number, sign: 1 | -1): number[] {
  let low = elevations[0] * sign;
  let high = low;
  let direction: -1 | 0 | 1 = 0;
  let gain = 0;
  return elevations.map((elevation) => {
    const value = elevation * sign;
    if (direction === 0) {
      low = Math.min(low, value);
      high = Math.max(high, value);
      if (value - low >= threshold) {
        gain += value - low;
        high = value;
        direction = 1;
      } else if (high - value >= threshold) {
        low = value;
        direction = -1;
      }
    } else if (direction === 1) {
      if (value > high) {
        gain += value - high;
        high = value;
      }
      if (high - value >= threshold) { low = value; direction = -1; }
    } else {
      low = Math.min(low, value);
      if (value - low >= threshold) {
        gain += value - low;
        high = value;
        direction = 1;
      }
    }
    return gain;
  });
}

function hasDistances(points: ElevationPoint[]): boolean {
  return points.length >= 5 && points.every((point, i) =>
    Number.isFinite(point.distance) && Number.isFinite(point.elevation)
    && (i === 0 || point.distance! >= points[i - 1].distance!)
  ) && points.at(-1)!.distance! > points[0].distance!;
}

function buildProfile(points: ElevationPoint[], threshold: number): ElevationProfile {
  const start = points[0].distance!;
  const end = points.at(-1)!.distance!;
  const spacing = Math.max(SAMPLE_SPACING_METERS, (end - start) / MAX_PROFILE_SAMPLES);
  const distances: number[] = [];
  const elevations: number[] = [];
  let cursor = 0;
  // A regular spatial grid prevents a burst of densely recorded noisy fixes
  // from receiving more weight than the same stretch sampled sparsely.
  for (let sample = 0; ; sample += 1) {
    const distance = Math.min(start + sample * spacing, end);
    while (cursor + 1 < points.length && points[cursor + 1].distance! <= distance) cursor += 1;
    const lower = points[cursor];
    const upper = points[Math.min(cursor + 1, points.length - 1)];
    const span = upper.distance! - lower.distance!;
    distances.push(distance);
    elevations.push(span > 0
      ? lower.elevation + (upper.elevation - lower.elevation) * (distance - lower.distance!) / span
      : lower.elevation);
    if (distance === end) break;
  }

  let left = 0;
  let right = 0;
  const filtered = elevations.map((elevation, index) => {
    // Preserve the observed start and finish, including short monotonic climbs.
    if (index === 0 || index === elevations.length - 1) return elevation;
    while (distances[left] < distances[index] - MEDIAN_RADIUS_METERS) left += 1;
    while (right + 1 < distances.length && distances[right + 1] <= distances[index] + MEDIAN_RADIUS_METERS) right += 1;
    return median(elevations.slice(left, right + 1));
  });
  return {
    distances,
    spatial: true,
    gains: accumulate(filtered, threshold, 1),
    losses: accumulate(filtered, threshold, -1),
  };
}

/** Tiny routes retain observed climbs; altitude-only callers use point smoothing. */
function buildSparseProfile(points: ElevationPoint[], threshold: number): ElevationProfile {
  const elevations = points.map((point) => point.elevation);
  const filtered = elevations.length < 5 ? elevations : elevations.map((_, i) => median(
    [-2, -1, 0, 1, 2].map((offset) => elevations[Math.max(0, Math.min(elevations.length - 1, i + offset))]),
  ));
  return {
    spatial: false,
    distances: points.map((_, i) => i),
    gains: accumulate(filtered, threshold, 1),
    losses: accumulate(filtered, threshold, -1),
  };
}

function calculate(points: ElevationPoint[], upToIndex: number, threshold: number, sign: 1 | -1): number {
  const endIndex = Math.min(Math.floor(upToIndex), points.length - 1);
  if (endIndex <= 0) return 0;
  let byThreshold = profiles.get(points);
  let profile = byThreshold?.get(threshold);
  if (!profile) {
    profile = hasDistances(points) ? buildProfile(points, threshold) : buildSparseProfile(points, threshold);
    if (!byThreshold) { byThreshold = new Map(); profiles.set(points, byThreshold); }
    byThreshold.set(threshold, profile);
  }
  const values = sign === 1 ? profile.gains : profile.losses;
  const distance = profile.spatial ? points[endIndex].distance! : endIndex;
  let left = 0;
  let right = profile.distances.length - 1;
  while (left < right) {
    const middle = Math.ceil((left + right) / 2);
    if (profile.distances[middle] <= distance) left = middle;
    else right = middle - 1;
  }
  if (left === values.length - 1) return values[left];
  const ratio = (distance - profile.distances[left]) / (profile.distances[left + 1] - profile.distances[left]);
  return values[left] + (values[left + 1] - values[left]) * ratio;
}

/** Distance-normalized ascent estimate; raw altitudes remain unchanged. */
export function calculateElevationGain(points: ElevationPoint[], upToIndex = points.length - 1, threshold = DEFAULT_ELEVATION_THRESHOLD_METERS): number {
  return calculate(points, upToIndex, threshold, 1);
}

export function calculateElevationLoss(points: ElevationPoint[], upToIndex = points.length - 1, threshold = DEFAULT_ELEVATION_THRESHOLD_METERS): number {
  return calculate(points, upToIndex, threshold, -1);
}
