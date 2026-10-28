import { calculateDistance } from './journeyUtils';

/** Distances in kilometres at each coordinate used by the color-zone renderer. */
export function colorZoneDistances(coordinates: readonly number[][]): number[] {
  const distances = coordinates.length ? [0] : [];
  for (let i = 1; i < coordinates.length; i++) {
    const previous = coordinates[i - 1];
    const current = coordinates[i];
    distances.push(distances[i - 1] + calculateDistance(previous[1], previous[0], current[1], current[0]));
  }
  return distances;
}

export function distanceAtZoneProgress(distances: readonly number[], progress: number): number {
  if (distances.length < 2) return 0;
  const position = Math.max(0, Math.min(1, progress)) * (distances.length - 1);
  const index = Math.floor(position);
  const next = Math.min(index + 1, distances.length - 1);
  return distances[index] + (distances[next] - distances[index]) * (position - index);
}

export function zoneProgressAtDistance(distances: readonly number[], distance: number): number {
  const last = distances.length - 1;
  if (last < 1 || distances[last] <= 0) return 0;
  const target = Math.max(0, Math.min(distances[last], distance));
  if (target === distances[last]) return 1;
  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const middle = Math.floor((lo + hi) / 2);
    if (distances[middle] <= target) lo = middle;
    else hi = middle;
  }
  const span = distances[hi] - distances[lo];
  return (lo + (span > 0 ? (target - distances[lo]) / span : 0)) / last;
}
